# Audit Fixes + RCON Implementation — Design Spec

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

This spec covers all confirmed bugs found during a full audit of the AIGameMaster dashboard, plus a new RCON feature for Arma Reforger's BattlEye RCON TCP interface. Changes are grouped into three areas: frontend data layer fixes, UI/code-quality improvements, and RCON implementation.

---

## Group 1 — Frontend Data Layer Fixes

### Fix 1: `uptime` always 0

**Root cause:** `use-bridge.ts` HTTP polling handler (the `startPolling` `setInterval`) maps most fields from `/api/status` but never maps `d.uptime_seconds` to state. Additionally, `StatsPanel` receives the `uptime` prop but never renders it.

**Fix:**
- In `use-bridge.ts` polling handler: add `uptime: d.uptime_seconds ?? prev.uptime`
- Add `heartbeatInterval: number` to `BridgeState`, map from `d.heartbeat_interval ?? prev.heartbeatInterval`
- In `StatsPanel`: render "Bridge Uptime" as a 5th metric card (below the current 4), formatted as `Xh Xm` or `Xm Xs` using a helper:
  ```ts
  function formatUptime(s: number): string {
    if (s < 60) return `${Math.floor(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  ```
- Add `heartbeatInterval` to `StatsPanelProps`; render as subscript under the Heartbeats metric: `"every {heartbeatInterval}s"`

### Fix 2: Counters not reset on server switch

**Root cause:** `selectServer()` in `use-bridge.ts` clears `consoleLogs`, `commandLog`, `chatHistory` but not `totalSpawns`, `totalDecisions`, `totalHeartbeats`. These accumulate from WebSocket events and persist incorrectly across server switches.

**Fix:** Add `totalSpawns: 0, totalDecisions: 0, totalHeartbeats: 0` to the `setState` call inside `selectServer`.

### Fix 3: Mission text not restored after reconnect/server switch

**Root cause:** The WebSocket `init` event from bridge.py includes `mission: _srv.mission_briefing`, but the `init` case handler in `use-bridge.ts` never reads `d.mission`. The `missionText` textarea in `StatsPanel` is fully local state — it starts blank and is never seeded.

**Fix:**
- Add `activeMission: string` to `BridgeState` (default `""`)
- In the `init` handler: set `activeMission: d.mission || ""`
- Add a `mission_update` event handler that sets `activeMission: d.briefing`
- Add `activeMission` to `StatsPanelProps`
- In `StatsPanel`: add `useEffect(() => { setMissionText(activeMission); }, [activeMission])` so the textarea pre-fills when the bridge sends a mission

### Fix 4: Heartbeat interval display

Covered in Fix 1 above — `heartbeatInterval` added to bridge state and rendered as subscript in stats panel.

---

## Group 2 — UI / Code Quality

### Fix 5: `cleanMapName` duplicated

**Root cause:** The same function body exists in `src/components/dashboard/header.tsx:66` and `src/components/dashboard/tactical-map.tsx`.

**Fix:** Move to `src/lib/utils.ts` (already exists — append to it). Import from `@/lib/utils` in both `header.tsx` and `tactical-map.tsx`, remove local copies.

```ts
// In src/lib/utils.ts — append:
export function cleanMapName(map: string): string {
  const parts = map.split(/[/\\]/);
  const last = parts[parts.length - 1] || map;
  return last.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

### Fix 6: Mobile navigation missing

**Root cause:** Nav tabs are `className="hidden md:flex ..."` in `header.tsx:206`. On mobile (`< 768px`) there is no way to navigate to the Server or Mods views.

**Fix:** Add a mobile nav row inside the header that is `flex md:hidden` — a horizontal pill-button bar below the title row, showing the same three nav items. Shares the existing `NAV_ITEMS` array and `onViewChange` handler.

```tsx
{/* Mobile Navigation — appears below header row on mobile only */}
<div className="flex md:hidden items-center gap-1 px-4 pb-2 overflow-x-auto">
  {NAV_ITEMS.map((item) => (
    <button
      key={item.id}
      onClick={() => onViewChange(item.id)}
      className={`shrink-0 px-3.5 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
        activeView === item.id
          ? "bg-white/[0.08] text-white"
          : "text-[#6b6b80] hover:text-white hover:bg-white/[0.04]"
      }`}
    >
      {item.label}
    </button>
  ))}
</div>
```

This renders inside the existing `<header>` element, below the main flex row, only on mobile.

---

## Group 3 — RCON Implementation

### Architecture

**Persistent async TCP connection in bridge.py (Option A).** The bridge maintains a single `RconClient` instance as a long-lived asyncio coroutine. Incoming server messages are buffered and broadcast to all connected WebSocket dashboards via the existing `broadcast()` helper. The connection auto-reconnects on drop.

RCON password and port come from `SERVER_CONFIG_PATH` (config.json → `rcon.password`, `rcon.port`). Host defaults to `127.0.0.1` (local server).

### BattlEye RCON Protocol (TCP)

Packet format (binary, no length prefix — each full packet is sent atomically):

```
[0x42][0x45][CRC32 LE 4 bytes][type 1 byte][payload N bytes]
```

CRC32 is computed over `[type byte] + [payload bytes]`.

Packet types:
| Type | Direction | Meaning |
|------|-----------|---------|
| `0x00` | C→S | Login — payload: password UTF-8 |
| `0x00` | S→C | Login response — payload: `[0x00]` fail, `[0x01]` success |
| `0x01` | C→S | Command — payload: `[seq byte]` + `[command ASCII]` |
| `0x01` | S→C | Command response — payload: `[seq byte]` + `[response text]` |
| `0x02` | S→C | Server message — payload: `[seq byte]` + `[message text]` |
| `0x02` | C→S | Server message ACK — payload: `[seq byte]` |

Multi-packet command responses: payload = `[seq]` + `[0xFF]` + `[packet_index]` + `[total_packets]` + `[chunk]`

CRC32 implementation: `zlib.crc32(type_byte + payload) & 0xFFFFFFFF` (standard Python `zlib`).

### `RconClient` class (bridge.py)

```python
class RconClient:
    """Persistent BattlEye RCON client for Arma Reforger (TCP)."""
    def __init__(self): ...
    async def connect(self, host: str, port: int, password: str): ...
    async def disconnect(self): ...
    async def send_command(self, command: str) -> str: ...
    async def _read_loop(self): ...  # handles server messages + ACKs
    def _make_packet(self, ptype: int, payload: bytes) -> bytes: ...
    def _parse_packet(self, data: bytes) -> tuple[int, bytes] | None: ...

    # State
    connected: bool
    authenticated: bool
    host: str
    port: int
    _seq: int  # 0–255 cycling
    _pending: dict[int, asyncio.Future]  # seq → Future for response
    _log: list[dict]  # [{ts, direction, text}] — last 200 entries
```

Auto-reconnect: if the read loop exits unexpectedly and `_should_run` is True, wait 10s and retry.

### Bridge.py global state

```python
_rcon: RconClient = RconClient()
```

On startup: attempt to connect using config.json values if available.

### New API Endpoints (bridge.py)

```
GET  /api/rcon/status
  → {connected, authenticated, host, port, log: [{ts, direction, text}]}

POST /api/rcon/command
  body: {command: string}
  → {output: string, error?: string}

POST /api/rcon/connect
  body: {} (reads from config.json automatically)
  → {status: "ok"|"error", detail?: string}
```

### WebSocket broadcast

When a server message arrives (type `0x02`), broadcast to all dashboards:
```json
{"event": "rcon_message", "data": {"text": "...", "ts": 1234567890.0}}
```

### RCON Tab in `server-config.tsx`

New tab: **RCON** — added to the `TABS` array after "Controls".

Tab contents:
1. **Status bar** — `StatusBadge` showing `connected`/`authenticating`/`disconnected` + Connect/Reconnect button
2. **Log** — scrollable `<div>` of `_rcon._log` entries, mono font, color-coded by direction (sent = cyan, received = white, error = red). Auto-scrolls to bottom. Max height fills available space.
3. **Input row** — text input + Send button (Enter key submits)
4. **Quick commands** — pill buttons: `#players`, `say -1 [message]`, `#shutdown`

The RCON tab polls `GET /api/rcon/status` every 3s when visible (same pattern as Controls tab's status polling).

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/lib/utils.ts` | Modify — add `cleanMapName` export |
| `src/hooks/use-bridge.ts` | Modify — add `uptime`, `heartbeatInterval`, `activeMission` to state; fix `selectServer` reset; add `mission_update` handler |
| `src/lib/types.ts` | No changes needed — `heartbeat_interval` already present in `BridgeStatus` |
| `src/components/dashboard/stats-panel.tsx` | Modify — add `activeMission`, `heartbeatInterval` props; render bridge uptime metric; heartbeat interval subscript; pre-fill mission textarea |
| `src/components/dashboard/header.tsx` | Modify — remove local `cleanMapName`; import from utils; add mobile nav row |
| `src/components/dashboard/tactical-map.tsx` | Modify — remove local `cleanMapName`; import from utils |
| `src/components/dashboard/server-config.tsx` | Modify — add RCON tab with status/log/input/quick-commands |
| `bridge.py` | Modify — add `RconClient` class; add `/api/rcon/status`, `/api/rcon/command`, `/api/rcon/connect` endpoints; startup connect attempt |

---

## Out of Scope

- Per-server RCON configuration (bridge manages one game server)
- RCON player kick/ban UI (can be typed manually in the console)
- Chat-to-RCON routing (AI GM chat ≠ RCON)
- Drag-to-resize panels
