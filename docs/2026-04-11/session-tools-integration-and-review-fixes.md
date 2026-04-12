# Session — Tools Integration + Review Fixes
**Date:** 2026-04-11
**Branch:** dev

## What this session did

Two work units:

1. Integrated AI GM and PlayerTracker tools into the panel repo
2. Applied code-review fixes from independent review

---

## Unit 1 — Tools Integration

### Goal
Wire up AI GM and PlayerTracker so any panel installer can optionally add them.
Both tools operate independently of the panel but the panel surfaces their status
and (for AI GM) controls bridge start/stop.

### How the two tools differ

| | AI Game Master | PlayerTracker Relay |
|---|---|---|
| Arma mod | Not a mod — bridge.py connects via RCON | Workshop install only — panel has no involvement |
| Panel involvement | Panel proxies all /api/aigm/* calls to bridge | Panel has its own built-in tracker; relay is for Mercury/ATAK forwarding separately |
| Start/stop | Manual — panel user starts bridge via AI GM tab | systemd service — runs after install |
| Activation | Bridge must be running; panel shows status | Relay detects mod data automatically |

### Files created / modified

**New files:**

| File | Purpose |
|------|---------|
| `tools/aigm/install.sh` | Inner installer — venv setup, Ollama model pull, aigm-bridge.service |
| `tools/aigm/AIGameMaster/requirements.txt` | Was missing from source repo — fastapi, uvicorn, httpx, pydantic |
| `tools/aigm/AIGameMaster/.env.example` | All placeholders — OLLAMA_URL, BRIDGE_PORT, ARMA_RCON_* |
| `tools/aigm/AIGameMaster/dashboard/.env.local.example` | All placeholders — AUTH_SECRET, ADMIN_PASSWORD, Discord OAuth |
| `tools/aigm/AIGameMaster/bridge.py` | Copied from source repo |
| `tools/aigm/AIGameMaster/data/` | intent.py, operation.py, prompts.py, 3×json — copied from source |
| `tools/aigm/AIGameMaster/tests/` | test_intent, test_operation, test_prompts — copied from source |
| `tools/aigm/AIGameMaster/dashboard/src/` | 34 source files — copied, .env.local EXCLUDED (had live credentials) |
| `tools/player-tracker/Relay/server.py` | Written from scratch — source repo had tests + config but no server |
| `tools/player-tracker/Relay/install.sh` | venv setup, player-tracker.service |
| `tools/player-tracker/Relay/pytest.ini` | asyncio_mode = auto (required for pytest-asyncio) |
| `tools/player-tracker/Relay/config.json` | Copied from source (all placeholders, api_key: "changeme") |
| `tools/player-tracker/Relay/requirements.txt` | Copied from source |
| `tools/player-tracker/Relay/tests/` | Copied from source |
| `docs/2026-04-11/tools/tools-integration.md` | Full install guide for both tools |

**Modified panel files:**

| File | Change |
|------|--------|
| `frontend/src/constants.js:84` | Added `system` to head_admin, admin, moderator, viewer, demo role tabs |
| `frontend/src/tabs/System.jsx` | Removed owner-only guard; added Fix buttons for 3 safe checks; removed 403 "Owner only" string |
| `backend/main.py` | Opened GET /api/system/diagnostics to all auth'd users; added POST /api/system/fix/{check_id}; added Ollama, aigm-bridge, player-tracker diagnostic checks |

### Credential safety
- `dashboard/.env.local` from source repo was NOT copied (contained live Discord OAuth credentials)
- `dashboard/.env.local.example` created with all placeholders
- `tools/aigm/AIGameMaster/.env.example` — all placeholders
- `tools/player-tracker/Relay/config.json` — `api_key: "changeme"` only

### PlayerTracker relay API contract (derived from conftest.py)

`POST /track` — player snapshot, fields: server_id, api_key, game, timestamp, map,
session_time, players_alive, players_total, players[]{uid, name, status, grid,
x, z, elevation, heading, heading_dir, faction, health, in_vehicle, vehicle_type,
is_squad_leader, squad_id, squad_name, is_admin, nearest_location{name,type,dist}}

`POST /event` — game event, fields: server_id, api_key, event_type, timestamp, data

`GET /health` — liveness check

Auth: api_key in body, X-Api-Key header, or Authorization: Bearer header.

---

## Unit 2 — Code Review Fixes

### Source
Independent review identified 4 issues.

### Issue 1 — Auth gap on fix endpoint (BUG — fixed)

**Problem:** `POST /api/system/fix/{check_id}` only checked that the user was
authenticated. viewer and demo roles could call it and trigger
`sudo systemctl restart aigm-bridge`.

**Fix:** Added `_FIX_ALLOWED_ROLES = {"owner", "head_admin", "admin"}` and a
role check before the handler dispatch. Returns 403 "Admin access required" for
moderator/viewer/demo.

**File:** `backend/main.py` — `system_fix()` function

```python
_FIX_ALLOWED_ROLES = {"owner", "head_admin", "admin"}

@app.post("/api/system/fix/{check_id}")
async def system_fix(check_id: str, request: Request):
    u = current_user(request)
    if not u.get("username"):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if u.get("role") not in _FIX_ALLOWED_ROLES:
        return JSONResponse({"error": "Admin access required"}, status_code=403)
    ...
```

### Issue 2 — Two conflicting install scripts (fixed)

**Problem:** `scripts/install-aigm.sh` did a `git clone` from GitHub into `~/AIGameMaster/`
and then ran the cloned repo's own `install.sh`. After bundling AI GM into
`tools/aigm/`, a second installer at `tools/aigm/install.sh` existed that
installed from the bundled copy. Two scripts, two install paths, no cross-reference.

**Fix:** Rewrote `scripts/install-aigm.sh` to install from `tools/aigm/` (bundled).
Kept all the sudo/user-detection/panel-.env-wiring logic. Removed the `git clone`.
Added sanity checks for `bridge.py` existence. Sets `AIGM_BRIDGE_PATH` in panel `.env`
(old script set `AIGM_DIR` which didn't match the env var the backend actually reads).

### Issue 3 — No commit (resolved by committing)

All work was in-place with no git commit. Given the parallel-session wipe incident
documented in memory, this was a real risk.

### Issue 4 — viewer/demo seeing System tab (not changed)

Assessment: read-only diagnostics for all roles is intentional and useful. A viewer
seeing "player-tracker relay is down" and escalating to an admin is a valid workflow.
The fix endpoint is now properly gated (Issue 1), so viewer/demo can see but not act.

---

## Diagnostic checks added (backend/main.py _run_diagnostics)

| Check ID | Type | What it checks | Auto-fixable |
|----------|------|---------------|--------------|
| `ollama_reachable` | warn | GET localhost:11434 — Ollama running | No |
| `aigm_bridge_service` | warn/fail | systemctl is-active aigm-bridge | Yes (restart) |
| `player_tracker_service` | warn/fail | systemctl is-active player-tracker | Yes (restart) |

---

## Backup taken
`/home/mark/backups/sitrep-panel-20260411-173942-pre-review-fixes.tar.gz`
Contains: backend/main.py, frontend/src/constants.js, frontend/src/tabs/System.jsx,
scripts/install-aigm.sh, tools/, docs/
