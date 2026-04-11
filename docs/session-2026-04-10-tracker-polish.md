# PlayerTracker Tab — Fix & Polish Session (2026-04-10)

Follow-up to the tracker rebuild (`c6eb6ef`). The rebuild landed the tab,
but the live-server test surfaced three concrete issues that this session
fixed. Read top-down to understand what changed and why.

## Where everything lives

- **Repo:** `/opt/panel` (branch `dev`)
- **Backend:** `/opt/panel/backend/main.py`
- **Tracker tab:** `/opt/panel/frontend/src/tabs/Tracker.jsx`
- **Mod source:** `/home/mark/PlayerTracker/Mod/Scripts/Game/PlayerTracker/PlayerTrackerComponent.c`
- **Env file:** `/opt/panel/.env`

## Commit ledger

| Commit    | What |
|-----------|------|
| `e032c94` | `fix(tracker): trust localhost for mod auth; add wired_up staleness window` |
| `756f140` | `feat(tracker): add Set Key UI + key/set endpoint; update API key in .env` |
| `6951044` | `fix(tracker): gate tab on server running state, not just mod ping staleness` |

## Issue 1 — Mod was getting 401 Unauthorized on every POST

**Symptom:** Live server logs showed every `/track` POST returning 401:
```
[PlayerTracker] /track error rest=15 http=401 data={"error":"Unauthorized"}
```

**Root cause:** The mod authenticates via `RestContext.SetHeaders`:
```c
m_pRestCtx.SetHeaders("Content-Type,application/json,X-Api-Key," + m_sApiKey);
```
Enfusion's `SetHeaders` only processes the first comma-pair (`Content-Type,
application/json`) and silently drops the rest, so `X-Api-Key` never reached
the panel. Documented in `reference_arma_reforger_research.md` §8.

**Fix (`e032c94`):** Mark explicitly required *not* changing the mod side.
The mod runs on the same host as the panel, so the panel now treats any
request from `127.0.0.1`/`::1` as implicitly authenticated. Remote callers
still need the header or `?key=` query param.

```python
def _tracker_check_key(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return True
    key = request.headers.get("X-Api-Key", "") or request.query_params.get("key", "")
    return bool(PLAYERTRACKER_API_KEY and key == PLAYERTRACKER_API_KEY)
```

**Also in `e032c94`:** Tracker tab visibility was using `_TRACKER_LAST_RX > 0`
with no decay — the tab would remain visible forever after the first ping.
Added a 90-second staleness window:
```python
"wired_up": bool(_TRACKER_LAST_RX > 0 and (time.time() - _TRACKER_LAST_RX) < 90),
```

**Also in `e032c94`:** The tracker rebuild left `App.jsx` and `ctx.jsx` with
two separate `createContext()` instances, so `Tracker.jsx`'s `useContext`
returned `undefined` and crashed the page (`Cannot destructure property 'C'`).
Unified on the shared `ctx.jsx` instance.

## Issue 2 — Need a UI to set the API key from the mod side

**Context:** The original Receiver tab only had a "Rotate Key" button that
generated a new random key. The actual workflow is the inverse: the user
sets a key in the Workbench attribute on the mod side, then needs to mirror
that key into the panel's `.env`. There was no UI for this.

**Fix (`756f140`):**

Backend — added `POST /api/tracker/key/set` (owner-only):
```python
@app.post("/api/tracker/key/set")
async def tracker_key_set(request: Request):
    body = await request.json()
    new_key = (body.get("key") or "").strip()
    if not new_key:
        return JSONResponse({"error": "key required"}, status_code=400)
    # ... rewrites .env atomically and updates os.environ live
```

Frontend — `ReceiverTab` now has three blocks:
1. **Current API Key** — masked display, Reveal/Hide, Rotate (random)
2. **Set Key (paste from mod)** — input field + Save button → `/api/tracker/key/set`
3. **Mod Workbench Config** — reference card showing the three values to enter
   in Workbench: `http://127.0.0.1:8000/`, `api/tracker/track`, `api/tracker/event`

The `.env` was also updated with the actual mod key:
```
PLAYERTRACKER_API_KEY=uqZh_b90HS5ruTA1cNnt_OuoHI9ARnj1O20pg7G21So
```
(This matters for any future remote-non-localhost callers; the localhost
trust path means it's not strictly required for the mod itself.)

## Issue 3 — Tab stayed visible after server shutdown

**Symptom:** After stopping the Arma server, the Tracker tab stayed visible
and the header still claimed the mod was connected.

**Root cause:** The 90s staleness window is the *only* signal `wired_up`
was using. If the server stopped, the user had to wait up to 90 seconds for
the next poll cycle to declare the mod stale. That's a long time, and it
means there's no detection of the case where the server is up but the mod
was never installed.

**Fix (`6951044`):** Added a server-running cross-check that runs on every
status poll. The tab is now gated on **both** signals.

```python
def _tracker_server_running() -> bool:
    try:
        for s in load_servers().get("servers", []):
            if is_server_running(s.get("service_name", SERVICE_NAME)):
                return True
    except Exception:
        pass
    return False
```

Both `tracker_status` and `tracker_debug` now compute:
```python
server_running = _tracker_server_running()
mod_wired = bool(_TRACKER_LAST_RX > 0 and (time.time() - _TRACKER_LAST_RX) < 90)
return {
    "wired_up": server_running and mod_wired,   # tab gate
    "server_running": server_running,           # exposed for UI
    ...
}
```

**State table:**

| `server_running` | `mod_wired` | `wired_up` | Tab visible? | Header badge |
|------------------|-------------|------------|--------------|--------------|
| false            | (any)       | false      | no           | — (tab hidden) |
| true             | false       | false      | no           | — (tab hidden) |
| true             | true        | true       | yes          | green "Live" pulsing |

When the user opens the tab manually (admin/owner only see it because
`ROLE_TABS` includes it), the header badge gives finer detail since the tab
is already in the DOM:

| Server      | Mod         | Badge                                            |
|-------------|-------------|--------------------------------------------------|
| down        | (any)       | red "Server Offline"                             |
| up          | not pinging | orange "Server Running — Mod Not Connected"      |
| up          | pinging     | green pulsing "Live"                             |

**Multi-server / new-server support:** `_tracker_server_running()` iterates
`load_servers()` on every call, so any server instance created via the panel's
server-management UI is automatically picked up. No per-server configuration
required — the mod just needs to point at `localhost:8000` and either send
the key or POST from the same host.

**Reaction time:** App.jsx polls `/api/tracker/status` every 8 seconds for
the top-level tab visibility check. So worst-case the tab disappears 8s
after the server stops, not 90s.

## Files touched this session

- `backend/main.py`
  - `_tracker_check_key()` — localhost trust path + query param fallback
  - `_tracker_server_running()` — new helper, iterates `load_servers()`
  - `tracker_status` — server-aware `wired_up`, exposes `server_running`
  - `tracker_debug` — same logic for the in-tab poll
  - `tracker_key_set` — new endpoint `POST /api/tracker/key/set`
- `frontend/src/tabs/Tracker.jsx`
  - `ReceiverTab` — added Set Key block + Mod Workbench Config reference card
  - `ReceiverTab` status grid — split into "Server Running" + "Mod Connected" rows
  - `Tracker` header — three-state badge (offline / waiting / live)
- `frontend/src/App.jsx`
  - Unified context import from `ctx.jsx` (fixes blank-page crash)
- `.env`
  - `PLAYERTRACKER_API_KEY` updated to the mod's actual key

## Things explicitly *not* changed

- **Mod source** — Mark required all fixes to be panel-side only
- **`SetHeaders` workaround** — not needed; localhost trust avoids it
- **90s mod staleness window** — kept as the secondary signal for the case
  where the server stays up but the mod silently dies

## Verification performed live

- `curl POST /api/tracker/track` from localhost without key → `{"ok":true}` ✓
- `curl POST /api/tracker/track` from localhost with old key → `{"ok":true}` ✓
- `systemctl is-active arma-reforger` → `active`, `server_running:true` in status response ✓
- Frontend build → clean, no warnings beyond pre-existing chunk-size note ✓
- Mark confirmed end-to-end working in the running panel after each fix
