# Audit Fixes + RCON Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six confirmed frontend data/UI bugs and implement a full BattlEye RCON console in the AIGameMaster dashboard.

**Architecture:** Frontend data fixes go into `use-bridge.ts` (state layer) and `stats-panel.tsx` (rendering). The RCON client is a persistent asyncio TCP class in `bridge.py` that exposes three REST endpoints; the dashboard adds a RCON tab to the existing `server-config.tsx` component. A shared `cleanMapName` utility is extracted to `src/lib/utils.ts` to eliminate duplication.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, Python 3.12 asyncio/FastAPI, BattlEye RCON TCP protocol (zlib CRC32 + struct).

---

## File Map

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Add `cleanMapName` + `formatUptime` exports |
| `src/hooks/use-bridge.ts` | Add `uptime`, `heartbeatInterval`, `activeMission` to state; fix `selectServer` reset; add `mission_update` handler |
| `src/components/dashboard/stats-panel.tsx` | Add `activeMission`, `heartbeatInterval` props; render Bridge Up metric; heartbeat label; prefill textarea |
| `src/components/dashboard/header.tsx` | Import `cleanMapName` from utils; remove local copy; add mobile nav row |
| `src/components/dashboard/tactical-map.tsx` | Import `cleanMapName` from utils; remove local copy |
| `src/app/dashboard/page.tsx` | Pass new `activeMission` + `heartbeatInterval` props to `StatsPanel` |
| `bridge.py` | Add `import struct, zlib`; add `RconClient` class; add `_rcon` global; add startup task; add `/api/rcon/*` endpoints |
| `src/components/dashboard/server-config.tsx` | Add RCON tab with status/log/input/quick-commands |

---

## Task 1: Add shared utilities to `src/lib/utils.ts`

**Files:**
- Modify: `src/lib/utils.ts`

The file currently contains only the `cn` helper. Append two exports.
`cleanMapName` merges the capabilities of both copies in the codebase: handles Arma localization keys (`#AR-Editor_Mission_GM_Eden_Name`) and plain path components (`World_Edit/ChernarusS.ent`). `formatUptime` formats seconds into human-readable duration.

- [ ] **Step 1: Append the two utility functions**

Open `src/lib/utils.ts`. The current content is:
```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Replace the full file with:
```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip Arma localization keys and path components to a readable map name.
 *  Handles both "#AR-Editor_Mission_GM_Eden_Name" and "World_Edit/ChernarusS.ent" inputs. */
export function cleanMapName(raw: string): string {
  if (!raw) return "";
  let name = raw;
  // Strip Arma localization key prefix (e.g. "#AR-Editor_Mission_")
  if (name.startsWith("#")) name = name.replace(/^#[A-Za-z]*[-_]?/, "");
  // Strip known Editor/Mission prefixes
  name = name.replace(/^Editor_Mission_/i, "");
  name = name.replace(/^Mission_/i, "");
  // If it is a path, take the last component
  const parts = name.split(/[/\\]/);
  name = parts[parts.length - 1] || name;
  // Normalise separators to spaces
  name = name.replace(/[_-]/g, " ");
  // Drop trailing " Name" suffix added by some Arma locale keys
  name = name.replace(/\s*Name$/i, "");
  return name.trim();
}

/** Format a duration in seconds to a human-readable string: "42s", "5m 12s", "2h 7m". */
export function formatUptime(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from the dashboard directory:
```bash
npx tsc --noEmit
```
Expected: no errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add cleanMapName and formatUptime to shared utils"
```

---

## Task 2: Fix `src/hooks/use-bridge.ts` data layer

**Files:**
- Modify: `src/hooks/use-bridge.ts`

Four independent fixes:
1. Map `uptime_seconds` and `heartbeat_interval` from HTTP polling.
2. Add `activeMission` to state, populated from WS `init` and `mission_update`.
3. Reset `totalSpawns/totalDecisions/totalHeartbeats` when switching servers.

- [ ] **Step 1: Add `heartbeatInterval` and `activeMission` to `BridgeState`**

Locate the `interface BridgeState` block (around line 18). The current block ends with:
```ts
  uptime: number;
  servers: ServerInfo[];
  activeServerId: string | null;
  consoleLogs: ConsoleLogEntry[];
}
```

Replace that section (the three lines before the closing brace) with:
```ts
  uptime: number;
  heartbeatInterval: number;
  activeMission: string;
  servers: ServerInfo[];
  activeServerId: string | null;
  consoleLogs: ConsoleLogEntry[];
}
```

- [ ] **Step 2: Add initial values to `useState`**

Locate the `useState<BridgeState>({` call. The current initial state ends with:
```ts
    uptime: 0,
    servers: [],
    activeServerId: null,
    consoleLogs: [],
```

Replace those four lines with:
```ts
    uptime: 0,
    heartbeatInterval: 90,
    activeMission: "",
    servers: [],
    activeServerId: null,
    consoleLogs: [],
```

- [ ] **Step 3: Populate `activeMission` in the `init` handler**

Locate the `case "init":` block. The `setState` call inside it currently ends with:
```ts
          servers: realServers,
          activeServerId: resolvedId,
        }));
```

Replace those three lines with:
```ts
          servers: realServers,
          activeServerId: resolvedId,
          activeMission: d.mission || "",
        }));
```

- [ ] **Step 4: Add `mission_update` handler**

Locate the `case "config_update":` block. After its closing `break;`, add the new handler:
```ts
      case "mission_update": {
        if (!isActiveServer()) break;
        const d = msg.data as { briefing: string };
        setState((prev) => ({ ...prev, activeMission: d.briefing || "" }));
        break;
      }
```

- [ ] **Step 5: Map uptime and heartbeat interval in the polling handler**

Locate the polling `setState` call inside `startPolling`. The current block contains:
```ts
          totalSpawns: d.total_spawns ?? prev.totalSpawns,
          totalDecisions: d.total_decisions ?? prev.totalDecisions,
          totalHeartbeats: d.total_heartbeats ?? prev.totalHeartbeats,
```

Replace those three lines with:
```ts
          totalSpawns: d.total_spawns ?? prev.totalSpawns,
          totalDecisions: d.total_decisions ?? prev.totalDecisions,
          totalHeartbeats: d.total_heartbeats ?? prev.totalHeartbeats,
          uptime: d.uptime_seconds ?? prev.uptime,
          heartbeatInterval: d.heartbeat_interval ?? prev.heartbeatInterval,
```

- [ ] **Step 6: Reset counters in `selectServer`**

Locate the `selectServer` callback. The current `setState` is:
```ts
    setState(prev => ({
      ...prev,
      activeServerId: serverId,
      consoleLogs: [],
      commandLog: [],
      chatHistory: [],
    }));
```

Replace it with:
```ts
    setState(prev => ({
      ...prev,
      activeServerId: serverId,
      consoleLogs: [],
      commandLog: [],
      chatHistory: [],
      totalSpawns: 0,
      totalDecisions: 0,
      totalHeartbeats: 0,
    }));
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-bridge.ts
git commit -m "fix: uptime mapping, counter reset on server switch, activeMission state"
```

---

## Task 3: Update `StatsPanel` to display new data

**Files:**
- Modify: `src/components/dashboard/stats-panel.tsx`
- Modify: `src/app/dashboard/page.tsx`

Renders the bridge uptime metric, adds a heartbeat interval subscript, and seeds the mission textarea from bridge state.

- [ ] **Step 1: Add `formatUptime` import**

At the top of `src/components/dashboard/stats-panel.tsx`, the imports currently start with:
```ts
import { Badge } from "@/components/ui/badge";
```

Add the utils import after it:
```ts
import { Badge } from "@/components/ui/badge";
import { formatUptime } from "@/lib/utils";
```

- [ ] **Step 2: Add `activeMission` and `heartbeatInterval` to `StatsPanelProps`**

Locate `interface StatsPanelProps`. The current last few lines before the closing `}` are:
```ts
  uptime: number;
  onSetConfig: (config: { ai_enabled?: boolean; difficulty?: number; gm_mode?: string }) => void;
```

Replace those two lines with:
```ts
  uptime: number;
  heartbeatInterval: number;
  activeMission: string;
  onSetConfig: (config: { ai_enabled?: boolean; difficulty?: number; gm_mode?: string }) => void;
```

- [ ] **Step 3: Destructure new props in the `StatsPanel` function signature**

Locate `export function StatsPanel({`. The current destructured props end with:
```ts
  onSendMission,
  onClearMission,
}: StatsPanelProps) {
```

Replace those three lines with:
```ts
  onSendMission,
  onClearMission,
  activeMission,
  heartbeatInterval,
}: StatsPanelProps) {
```

- [ ] **Step 4: Add `useEffect` to seed the mission textarea**

Locate this existing `useEffect`:
```ts
  // Sync difficulty from server when not dragging
  useEffect(() => {
    if (!draggingRef.current) setLocalDifficulty(difficulty);
  }, [difficulty]);
```

Add a new `useEffect` directly after it:
```ts
  // Seed mission textarea from bridge state when it changes
  useEffect(() => {
    setMissionText(activeMission);
  }, [activeMission]);
```

- [ ] **Step 5: Update the Heartbeats metric card label**

Locate the metrics grid. The current Heartbeats card is:
```tsx
          <MetricCard label="Heartbeats" value={totalHeartbeats} />
```

Replace it with:
```tsx
          <MetricCard
            label={heartbeatInterval ? `Heartbeats / ${heartbeatInterval}s` : "Heartbeats"}
            value={totalHeartbeats}
          />
```

- [ ] **Step 6: Replace "Session Time" with "Bridge Up"**

Locate the Session Time card:
```tsx
          <MetricCard label="Session Time" value={`${Math.floor(s?.session_time_minutes || 0)}m`} />
```

Replace it with:
```tsx
          <MetricCard label="Bridge Up" value={formatUptime(uptime)} />
```

- [ ] **Step 7: Pass new props from `page.tsx`**

Open `src/app/dashboard/page.tsx`. Locate the `<StatsPanel` JSX block. The current props end with:
```tsx
        uptime={bridge.uptime}
        onSetConfig={bridge.setConfig}
```

Replace those two lines with:
```tsx
        uptime={bridge.uptime}
        heartbeatInterval={bridge.heartbeatInterval}
        activeMission={bridge.activeMission}
        onSetConfig={bridge.setConfig}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/stats-panel.tsx src/app/dashboard/page.tsx
git commit -m "feat: bridge uptime metric, heartbeat interval label, mission textarea prefill"
```

---

## Task 4: Deduplicate `cleanMapName` and add mobile navigation to `Header`

**Files:**
- Modify: `src/components/dashboard/header.tsx`
- Modify: `src/components/dashboard/tactical-map.tsx`

Both components have local `cleanMapName` copies with different (partial) implementations. Replace both with the shared util. Also adds a mobile nav bar so the Server and Mods views are reachable on phones.

- [ ] **Step 1: Update header.tsx imports and remove local function**

Open `src/components/dashboard/header.tsx`. The current imports at the top are:
```ts
"use client";

import { useEffect, useState, useRef } from "react";
import type { ServerInfo } from "@/lib/types";
```

Replace with:
```ts
"use client";

import { useEffect, useState, useRef } from "react";
import type { ServerInfo } from "@/lib/types";
import { cleanMapName } from "@/lib/utils";
```

Then find and delete the local function (lines 66–71 in the original):
```ts
function cleanMapName(map: string): string {
  // Extract readable map name from full path/id
  const parts = map.split(/[/\\]/);
  const last = parts[parts.length - 1] || map;
  return last.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

Delete those six lines entirely.

- [ ] **Step 2: Add mobile nav row to the header**

Locate the `<header` JSX element. Its current opening tag is:
```tsx
    <header className="flex items-center justify-between px-5 py-2.5 bg-card/80 border-b border-white/[0.04] sticky top-0 z-50 backdrop-blur-xl">
```

Replace it with (wrap existing content in an inner div, add mobile row as sibling):
```tsx
    <header className="bg-card/80 border-b border-white/[0.04] sticky top-0 z-50 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 py-2.5 relative">
```

Then find the closing `</header>` tag (it will be after the right-side status icons section). Change it to close both the inner div and the header:
```tsx
      </div>
      {/* Mobile Navigation — only visible below md breakpoint */}
      <nav className="flex md:hidden items-center gap-1 px-4 pb-2 overflow-x-auto">
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
      </nav>
    </header>
```

- [ ] **Step 3: Update tactical-map.tsx imports and remove local function**

Open `src/components/dashboard/tactical-map.tsx`. The file starts with:
```tsx
"use client";
```

Find the imports section (first few lines). Add the utils import right after the `"use client"` directive:
```tsx
"use client";

import { cleanMapName } from "@/lib/utils";
```

Then find and delete the local `cleanMapName` function (lines 12–25 in the original):
```ts
// Strip Arma localization keys like "#AR-Editor_Mission_GM_Eden_Name" → "GM Eden"
function cleanMapName(raw: string): string {
  if (!raw) return "";
  let name = raw;
  // Remove localization prefix
  if (name.startsWith("#")) name = name.replace(/^#[A-Za-z]*[-_]?/, "");
  // Remove common prefixes
  name = name.replace(/^Editor_Mission_/i, "");
  name = name.replace(/^Mission_/i, "");
  // Replace underscores with spaces
  name = name.replace(/_/g, " ");
  // Remove "Name" suffix
  name = name.replace(/\s*Name$/i, "");
  return name.trim();
}
```

Delete those 14 lines entirely.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/header.tsx src/components/dashboard/tactical-map.tsx
git commit -m "refactor: deduplicate cleanMapName to utils; add mobile nav bar to header"
```

---

## Task 5: Add `RconClient` and RCON endpoints to `bridge.py`

**Files:**
- Modify: `bridge.py`

Adds the BattlEye RCON TCP client class, a global `_rcon` instance, an auto-connect startup task, and three REST endpoints. No frontend changes yet — Task 6 adds the UI.

- [ ] **Step 1: Add `struct` and `zlib` imports**

Find line 37 in `bridge.py`:
```python
import asyncio, json, logging, os, time, re, random, math, threading
```

Add `struct` and `zlib` on the next line:
```python
import asyncio, json, logging, os, time, re, random, math, threading
import struct, zlib
```

- [ ] **Step 2: Add the `RconClient` class**

Find the comment and line:
```python
# ─── WebSocket Broadcast ──────────────────────────────────────────────────
async def broadcast(event: str, data, server_id: str = None):
```

Insert the full `RconClient` class **above** that comment:
```python
# ─── RCON Client ──────────────────────────────────────────────────────────────
class RconClient:
    """Persistent BattlEye RCON client for Arma Reforger (TCP).

    Packet format: b'BE' + CRC32-LE(type+payload) + type(1) + payload(N)
    type 0x00 = login, 0x01 = command/response, 0x02 = server message/ack
    """
    MAX_LOG = 200
    RECONNECT_DELAY = 10

    def __init__(self):
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self.connected: bool = False
        self.authenticated: bool = False
        self.host: str = ""
        self.port: int = 16666
        self._password: str = ""
        self._seq: int = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._log: list[dict] = []
        self._should_run: bool = False
        self._read_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.last_error: str = ""

    def _log_entry(self, direction: str, text: str) -> None:
        self._log.append({"ts": time.time(), "direction": direction, "text": text})
        if len(self._log) > self.MAX_LOG:
            self._log.pop(0)

    def _make_packet(self, ptype: int, payload: bytes) -> bytes:
        content = bytes([ptype]) + payload
        crc = zlib.crc32(content) & 0xFFFFFFFF
        return b'BE' + struct.pack('<I', crc) + content

    async def _read_packet(self) -> tuple[int, bytes]:
        """Read one complete RCON packet. Accumulates bytes until CRC validates."""
        header = await asyncio.wait_for(self._reader.readexactly(6), timeout=65.0)
        if header[:2] != b'BE':
            raise ValueError(f"Bad RCON header: {header[:2]!r}")
        expected_crc = struct.unpack('<I', header[2:6])[0]
        buf = bytearray()
        for _ in range(4097):  # max 4096-byte payload
            if len(buf) >= 1 and (zlib.crc32(bytes(buf)) & 0xFFFFFFFF) == expected_crc:
                return (buf[0], bytes(buf[1:]))
            b = await asyncio.wait_for(self._reader.readexactly(1), timeout=5.0)
            buf.extend(b)
        raise ValueError("RCON packet too large or CRC never matched")

    async def connect(self, host: str, port: int, password: str) -> None:
        """Connect to RCON, authenticate, start background reader. Raises on failure."""
        await self.disconnect()
        self.host = host
        self.port = port
        self._password = password
        self._should_run = True
        self.last_error = ""

        self._reader, self._writer = await asyncio.open_connection(host, port)
        self.connected = True
        self._log_entry("system", f"Connected to {host}:{port}")

        # Send login packet
        self._writer.write(self._make_packet(0x00, password.encode("utf-8")))
        await self._writer.drain()

        # Read login response (type 0x00, payload [0x01] = success)
        ptype, payload = await asyncio.wait_for(self._read_packet(), timeout=5.0)
        if ptype != 0x00 or not payload or payload[0] != 0x01:
            raise ValueError("Authentication failed — check rcon.password in config.json")

        self.authenticated = True
        self._log_entry("system", "Authenticated")
        self._read_task = asyncio.create_task(self._read_loop())

    async def disconnect(self) -> None:
        self._should_run = False
        if self._read_task:
            self._read_task.cancel()
            self._read_task = None
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None
        self.connected = False
        self.authenticated = False

    async def send_command(self, command: str) -> str:
        """Send an RCON command and return the server's response text."""
        if not self.authenticated:
            return "Not connected"
        async with self._lock:
            seq = self._seq & 0xFF
            self._seq = (self._seq + 1) & 0xFF
            fut: asyncio.Future = asyncio.get_event_loop().create_future()
            self._pending[seq] = fut
        try:
            pkt = self._make_packet(0x01, bytes([seq]) + command.encode("utf-8"))
            self._log_entry("sent", command)
            self._writer.write(pkt)
            await self._writer.drain()
            result = await asyncio.wait_for(asyncio.shield(fut), timeout=5.0)
            self._log_entry("recv", result)
            return result
        except asyncio.TimeoutError:
            self._pending.pop(seq, None)
            return "Command timed out"
        except Exception as e:
            self._pending.pop(seq, None)
            return f"Error: {e}"

    async def _read_loop(self) -> None:
        try:
            while self._should_run:
                try:
                    ptype, payload = await asyncio.wait_for(self._read_packet(), timeout=60.0)
                except asyncio.TimeoutError:
                    # Keepalive: send empty command
                    if self._writer:
                        seq = self._seq & 0xFF
                        self._seq = (self._seq + 1) & 0xFF
                        self._writer.write(self._make_packet(0x01, bytes([seq])))
                        await self._writer.drain()
                    continue

                if ptype == 0x01 and len(payload) >= 1:
                    seq = payload[0]
                    # Multi-packet: [seq][0xFF][idx][total][text]
                    if len(payload) >= 4 and payload[1] == 0xFF:
                        text = payload[4:].decode("utf-8", errors="replace")
                    else:
                        text = payload[1:].decode("utf-8", errors="replace")
                    fut = self._pending.pop(seq, None)
                    if fut and not fut.done():
                        fut.set_result(text)

                elif ptype == 0x02 and len(payload) >= 1:
                    seq = payload[0]
                    text = payload[1:].decode("utf-8", errors="replace")
                    self._log_entry("server", text)
                    # ACK the server message
                    self._writer.write(self._make_packet(0x02, bytes([seq])))
                    await self._writer.drain()
                    await broadcast("rcon_message", {"text": text, "ts": time.time()})

        except (ConnectionResetError, ConnectionAbortedError, asyncio.CancelledError):
            pass
        except Exception as e:
            log.warning(f"RCON read loop error: {e}")
            self.last_error = str(e)
        finally:
            self.connected = False
            self.authenticated = False
            if self._should_run:
                self._log_entry("system", f"Disconnected. Retrying in {self.RECONNECT_DELAY}s...")
                await asyncio.sleep(self.RECONNECT_DELAY)
                asyncio.create_task(self._auto_reconnect())

    async def _auto_reconnect(self) -> None:
        if not self._should_run:
            return
        try:
            cfg = {}
            if SERVER_CONFIG_PATH.exists():
                cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8")).get("rcon", {})
            host = cfg.get("address") or "127.0.0.1"
            port = int(cfg.get("port", 16666))
            password = cfg.get("password") or self._password
            await self.connect(host, port, password)
        except Exception as e:
            log.info(f"RCON reconnect failed: {e}")
            self.last_error = str(e)
            self._log_entry("system", f"Reconnect failed: {e}")
            if self._should_run:
                await asyncio.sleep(self.RECONNECT_DELAY)
                asyncio.create_task(self._auto_reconnect())


_rcon = RconClient()


async def _rcon_auto_connect():
    """Try to connect RCON on startup if config.json has a password."""
    await asyncio.sleep(3)
    try:
        cfg = {}
        if SERVER_CONFIG_PATH.exists():
            cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8")).get("rcon", {})
        password = cfg.get("password", "")
        if not password:
            log.info("RCON: no password in config.json rcon.password — skipping auto-connect")
            return
        host = cfg.get("address") or "127.0.0.1"
        port = int(cfg.get("port", 16666))
        await _rcon.connect(host, port, password)
        log.info(f"RCON connected to {host}:{port}")
    except Exception as e:
        log.info(f"RCON auto-connect failed (will retry on manual connect): {e}")

```

- [ ] **Step 3: Add RCON auto-connect task to the lifespan startup**

Find this line in the `lifespan` function:
```python
    asyncio.create_task(_auto_warmup())
    yield
```

Replace it with:
```python
    asyncio.create_task(_auto_warmup())
    asyncio.create_task(_rcon_auto_connect())
    yield
```

- [ ] **Step 4: Add the three RCON REST endpoints**

Find the comment and endpoint:
```python
@app.get("/api/servers")
async def api_servers():
```

Insert the RCON endpoints **above** that block:
```python
# ─── RCON API ────────────────────────────────────────────────────────────────
@app.get("/api/rcon/status")
async def api_rcon_status():
    """RCON connection status and recent log."""
    return {
        "connected": _rcon.connected,
        "authenticated": _rcon.authenticated,
        "host": _rcon.host,
        "port": _rcon.port,
        "error": _rcon.last_error or None,
        "log": _rcon._log[-200:],
    }

@app.post("/api/rcon/command")
async def api_rcon_command(request: Request):
    """Send an RCON command and return the server's response."""
    body = await request.json()
    command = body.get("command", "").strip()
    if not command:
        raise HTTPException(400, "command is required")
    output = await _rcon.send_command(command)
    return {"output": output}

@app.post("/api/rcon/connect")
async def api_rcon_connect():
    """Connect or reconnect RCON using credentials from config.json."""
    try:
        cfg = {}
        if SERVER_CONFIG_PATH.exists():
            cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8")).get("rcon", {})
        password = cfg.get("password", "")
        if not password:
            return {"status": "error", "detail": "No RCON password found in config.json (rcon.password)"}
        host = cfg.get("address") or "127.0.0.1"
        port = int(cfg.get("port", 16666))
        await _rcon.connect(host, port, password)
        return {"status": "ok", "host": host, "port": port}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

```

- [ ] **Step 5: Verify bridge.py syntax**

```bash
python3 -m py_compile /home/mark/AIGameMaster/AIGameMaster/bridge.py && echo "OK"
```
Expected: `OK` (exit 0, no output other than "OK").

- [ ] **Step 6: Commit**

```bash
git add /home/mark/AIGameMaster/AIGameMaster/bridge.py
git commit -m "feat: BattlEye RCON TCP client + /api/rcon/* endpoints in bridge"
```

---

## Task 6: Add RCON tab to `server-config.tsx`

**Files:**
- Modify: `src/components/dashboard/server-config.tsx`

Adds a "RCON" tab with connection status, a scrollable log, a command input, and three quick-command buttons. Polls `/api/rcon/status` every 3s when the tab is active.

- [ ] **Step 1: Add RCON state variables**

Find the existing state declarations block (around line 95–107):
```ts
  const [processStatus, setProcessStatus] = useState<ServerProcessStatus | null>(null);
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealth | null>(null);
```

After the last existing `useState` in that block, add:
```ts
  // ─── RCON state ──────────────────────────────────────────────────────────
  const [rconStatus, setRconStatus] = useState<{
    connected: boolean;
    authenticated: boolean;
    host: string;
    port: number;
    error: string | null;
    log: { ts: number; direction: string; text: string }[];
  } | null>(null);
  const [rconInput, setRconInput] = useState("");
  const [rconLoading, setRconLoading] = useState(false);
  const rconLogEndRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Update `activeTab` type to include "rcon"**

Find:
```ts
  const [activeTab, setActiveTab] = useState<"controls" | "config" | "ollama" | "console" | "files">("controls");
```

Replace it with:
```ts
  const [activeTab, setActiveTab] = useState<"controls" | "config" | "ollama" | "console" | "files" | "rcon">("controls");
```

- [ ] **Step 3: Add `fetchRconStatus` callback**

Find the `fetchOllamaHealth` callback:
```ts
  const fetchOllamaHealth = useCallback(async () => {
```

Add a new callback directly after it:
```ts
  const fetchRconStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/rcon/status");
      if (res.ok) setRconStatus(await res.json());
    } catch { /* bridge offline */ }
  }, []);
```

- [ ] **Step 4: Add RCON polling effect**

Find the existing polling `useEffect` that polls `fetchStatus` and `fetchOllamaHealth`. After it, add:
```ts
  // Poll RCON status when RCON tab is active
  useEffect(() => {
    if (activeTab !== "rcon") return;
    fetchRconStatus();
    const iv = setInterval(fetchRconStatus, 3000);
    return () => clearInterval(iv);
  }, [activeTab, fetchRconStatus]);

  // Auto-scroll RCON log
  useEffect(() => {
    if (rconLogEndRef.current) {
      rconLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [rconStatus?.log]);
```

- [ ] **Step 5: Add `handleRconSend` and `handleRconConnect` handlers**

Find the `handleWarmup` function:
```ts
  const handleWarmup = async () => {
```

Add two new functions directly before it:
```ts
  const handleRconConnect = async () => {
    setActionLoading("rcon-connect");
    try {
      const res = await fetch("/api/rcon/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (data.status !== "ok") setError(data.detail || "RCON connect failed");
      await fetchRconStatus();
    } catch { setError("RCON connect failed"); }
    setActionLoading("");
  };

  const handleRconSend = async () => {
    if (!rconInput.trim()) return;
    setRconLoading(true);
    try {
      await fetch("/api/rcon/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: rconInput.trim() }),
      });
      setRconInput("");
      await fetchRconStatus();
    } catch { /* ignore */ }
    setRconLoading(false);
  };

```

- [ ] **Step 6: Add "RCON" to the TABS array**

Find:
```ts
  const TABS = [
    { id: "controls" as const, label: "Controls" },
    { id: "console" as const, label: `Console (${consoleLogs.length})` },
    { id: "files" as const, label: "Files" },
    { id: "config" as const, label: "Config Editor" },
    { id: "ollama" as const, label: "AI Engine" },
  ];
```

Replace with:
```ts
  const TABS = [
    { id: "controls" as const, label: "Controls" },
    { id: "rcon" as const, label: "RCON" },
    { id: "console" as const, label: `Console (${consoleLogs.length})` },
    { id: "files" as const, label: "Files" },
    { id: "config" as const, label: "Config Editor" },
    { id: "ollama" as const, label: "AI Engine" },
  ];
```

- [ ] **Step 7: Add RCON tab content**

Find the last tab content block in the JSX. It will be the AI Engine tab ending with something like:
```tsx
      {/* ─── AI Engine Tab ── */}
      {activeTab === "ollama" && (
        ...
      )}
```

After that block's closing `)}`, add the RCON tab:
```tsx
      {/* ─── RCON Tab ────────────────────────────────────── */}
      {activeTab === "rcon" && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-6 gap-4">
          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <span className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase">RCON</span>
            {rconStatus ? (
              <StatusBadge
                status={
                  rconStatus.authenticated ? "running"
                  : rconStatus.connected ? "starting"
                  : "stopped"
                }
              />
            ) : (
              <StatusBadge status="unknown" />
            )}
            {rconStatus?.host && (
              <span className="text-[10px] font-mono text-[#6b6b80]">
                {rconStatus.host}:{rconStatus.port}
              </span>
            )}
            <ActionButton
              onClick={handleRconConnect}
              loading={actionLoading === "rcon-connect"}
            >
              {rconStatus?.connected ? "Reconnect" : "Connect"}
            </ActionButton>
            {rconStatus?.error && (
              <span className="text-[10px] text-[#ef4444] truncate max-w-xs">{rconStatus.error}</span>
            )}
          </div>

          {/* Log */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-black/20 rounded-lg border border-white/[0.06] p-3 font-mono text-[11px] space-y-0.5">
            {(rconStatus?.log ?? []).length === 0 && (
              <span className="text-[#6b6b80]">
                No output. Connect to an Arma Reforger server with RCON enabled on port {rconStatus?.port ?? 16666}.
              </span>
            )}
            {(rconStatus?.log ?? []).map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2 leading-5 ${
                  entry.direction === "sent"
                    ? "text-[#22d3ee]/80"
                    : entry.direction === "system"
                    ? "text-[#6b6b80]"
                    : entry.direction === "server"
                    ? "text-[#eab308]/80"
                    : "text-white/70"
                }`}
              >
                <span className="text-[#6b6b80] shrink-0 tabular-nums">
                  {new Date(entry.ts * 1000).toLocaleTimeString()}
                </span>
                <span className="shrink-0 w-3">
                  {entry.direction === "sent" ? "▶" : entry.direction === "recv" ? "◀" : "·"}
                </span>
                <span className="break-all">{entry.text}</span>
              </div>
            ))}
            <div ref={rconLogEndRef} />
          </div>

          {/* Command input */}
          <div className="flex gap-2 shrink-0">
            <input
              value={rconInput}
              onChange={e => setRconInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !rconLoading) handleRconSend(); }}
              placeholder={
                rconStatus?.authenticated
                  ? "Enter RCON command (e.g. #players, say -1 hello)..."
                  : "Connect first to send commands"
              }
              disabled={!rconStatus?.authenticated || rconLoading}
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder:text-[#6b6b80]/60 focus:outline-none focus:border-white/[0.15] disabled:opacity-40"
            />
            <ActionButton
              onClick={handleRconSend}
              disabled={!rconStatus?.authenticated || !rconInput.trim()}
              loading={rconLoading}
            >
              Send
            </ActionButton>
          </div>

          {/* Quick commands */}
          <div className="flex gap-2 flex-wrap shrink-0">
            {["#players", "say -1 Hello", "#shutdown"].map(cmd => (
              <button
                key={cmd}
                type="button"
                onClick={() => setRconInput(cmd)}
                disabled={!rconStatus?.authenticated}
                className="px-3 py-1.5 text-[10px] font-mono rounded-md border border-white/[0.06] text-[#6b6b80] hover:text-white hover:border-white/[0.12] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/server-config.tsx
git commit -m "feat: RCON tab in server config — status, live log, command input, quick commands"
```

---

## Manual Verification Checklist

After all tasks are committed, verify in the browser (run `npx next dev` or `npx next build && npx next start`):

**Group 1 — Data fixes:**
- [ ] Dashboard header shows Bridge Uptime ticking up (was always `0s`)
- [ ] Heartbeats metric shows `/ 90s` subscript (or whatever the configured interval is)
- [ ] Switch servers — Total Spawns / AI Decisions / Heartbeats reset to 0 then restore correct bridge values on next poll
- [ ] Set a mission briefing, reload the page — mission textarea is pre-populated

**Group 2 — UI fixes:**
- [ ] On desktop: map name displays correctly in the server dropdown (no `#AR-...` artifact)
- [ ] On mobile (`< 768px`): "Game Master / Server / Mods" tabs visible below the header — tapping "Server" navigates to the server view
- [ ] No TypeScript errors, no console errors

**Group 3 — RCON:**
- [ ] Navigate to Server → RCON tab
- [ ] Status badge shows "stopped" (disconnected)
- [ ] Click Connect — status changes to "running" if Arma Reforger is up with RCON enabled
- [ ] Type `#players` and press Enter — response appears in the log
- [ ] Quick command button "#players" pre-fills the input
