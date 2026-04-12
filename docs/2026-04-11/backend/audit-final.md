# SITREP Panel — Backend Audit (Final, Verified)
**Date:** 2026-04-11
**Branch:** `dev` — commit `77dd4cf`
**File:** `backend/main.py` — 6,248 lines
**Status:** Two independent audits + one verification session. This document supersedes
`BACKEND_AUDIT_2026-04-11.md` and `BACKEND_AUDIT_2026-04-11-session2.md`.
**Policy for fresh sessions:** All work on `dev` branch only. Never commit to `main`.
Mark promotes `dev` → `main` manually after review.

---

## 0. Before you touch anything

```bash
cd /opt/panel
git branch          # must be on dev
git status          # must be clean
git log --oneline -3
```

Then make a backup:

```bash
git tag v-pre-audit-$(date +%Y%m%d)
mkdir -p /home/mark/backups
tar -czf /home/mark/backups/sitrep-panel-$(date +%Y%m%d-%H%M).tar.gz /opt/panel --exclude /opt/panel/.git --exclude /opt/panel/backend/.venv
```

Do not proceed without a confirmed backup.

---

## 1. What is this project

SITREP is a self-hosted Arma Reforger server management panel.

- **Backend:** `/opt/panel/backend/main.py` — single-file FastAPI app, Python 3.12, runs via `uvicorn` under systemd as `sitrep-api.service`
- **Frontend:** `/opt/panel/frontend/src/` — Vite + React, built to `/opt/panel/frontend/dist/`, served as static files by the backend (not a dev server)
- **Runtime venv:** `/opt/panel/backend/.venv/` (uv-managed) — this is what the live systemd service uses
- **Data:** `/opt/panel/backend/data/` — JSON files + SQLite DBs, not in git
- **Env config:** `/opt/panel/.env` — only `PANEL_URL` and `PLAYERTRACKER_API_KEY` are set on this machine
- **Install script:** `/opt/panel/install.sh` — Ubuntu 22.04+ only, clones repo and sets up systemd service
- **Tests:** `backend/tests/` — 6 test files, 47 tests (all pass on current code)

The backend serves 163 routes across: auth, server management, file manager, mods/workshop, player database, stats, RCON, AI GM bridge, PlayerTracker, webhooks, crontab, diagnostics, admin tools.

---

## 2. Architecture — what is solid, do not change

These are confirmed correct through two independent audits. Leave them alone unless you have a specific reason.

| Area | Status | Notes |
|---|---|---|
| Password hashing | Correct | PBKDF2-SHA256 × 100k, per-user salt, `hmac.compare_digest` for verify |
| JWT + cookie auth | Correct | HttpOnly, SameSite=Strict, COOKIE_SECURE auto-detected from PANEL_URL |
| Refresh token store | Correct | Opaque hex, server-side, per-user revocation on password change |
| Token revocation check | Correct pattern | Checks `tokens_valid_after` on every request — but has a performance issue (see §3) |
| Atomic JSON writes | Correct | All 9 JSON stores use tmp-then-replace correctly |
| Path traversal protection | Correct | `is_path_safe()` uses `.resolve()` + prefix match with `os.sep` |
| Rate limiting | Correct design | Two-tier (burst + sustained), login lockout — has one memory leak (see §3) |
| Subprocess calls | Correct pattern | All use list-form args, `shell=True` never appears — no command injection risk |
| Permission checks | Consistent | `require_permission()` used in 88 places, one known miss (see §3) |
| Security headers | Present | X-Frame-Options, X-Content-Type-Options, Referrer-Policy all set |

---

## 3. Open issues — verified accurate

Issues are ordered by session priority, not severity label.

---

### PHASE 1 — Fix first (stability / correctness)

#### P1-1. 16 blocking sync helpers called from async routes — HIGH
**Verified correct.** This is the most impactful issue for live stability.

FastAPI runs on a single-threaded async event loop. Blocking calls on the main thread freeze
all connected users until the call returns. `systemctl` can hang for 5–30s if a service is
transitioning. During server provisioning, 3+ blocking calls happen in sequence.

**The fix is at the async call site, not inside the sync helper.** The sync helpers
(`systemctl`, `is_server_running`, `get_server_pid`, `_sudo_probe`, `_manage_ports`,
`_port_status`) are correct as sync functions — they should remain sync. What needs to change
is how async routes call them.

**Correct pattern (already used elsewhere in the file):**
```python
# Wrong (current):
result = systemctl("start", service_name)

# Right:
result = await asyncio.to_thread(systemctl, "start", service_name)
```

**Affected async call sites** (fix these, not the helpers):

Direct `subprocess.run()` inside async def bodies:
| Line | Route handler | Call |
|---|---|---|
| 2044 | `provision_server` | `subprocess.run(["sudo","tee",...])` |
| 2053 | `provision_server` | `subprocess.run(["sudo","systemctl","daemon-reload",...])` |
| 2056 | `provision_server` | `subprocess.run(["sudo","rm",...])` |
| 2110 | `delete_server` | `subprocess.run(cmd,...)` |
| 2114 | `delete_server` | `subprocess.run(["sudo","rm",...])` |
| 2117 | `delete_server` | `subprocess.run(["sudo","systemctl","daemon-reload",...])` |
| 4213 | `set_startup_params` | `subprocess.run(["sudo","tee",...])` |
| 4220 | `set_startup_params` | `subprocess.run(["sudo","systemctl","daemon-reload",...])` |
| 5139 | `aigm_start` | `subprocess.run(["sudo","systemctl","start","aigm-bridge",...])` |
| 5179 | `aigm_stop` | `subprocess.run(["sudo","systemctl","stop","aigm-bridge",...])` |

Sync helpers called directly from async routes (wrap at the call site):
| Helper | Issue | Where it's called without wrapping |
|---|---|---|
| `systemctl()` line 947 | Blocks on `systemctl` | `server_action()` ~line 3031 |
| `is_server_running()` line 957 | Calls `systemctl is-active` | Multiple async routes: `list_servers_endpoint`, `server_instance_status`, `status`, etc. |
| `get_server_pid()` line 967 | Calls `systemctl show` | Same async routes as above |
| `_sudo_probe()` line 784 | Called via `_provision_sudo_preflight()` | `provision_server` async body |
| `_manage_ports()` line 2809 | Direct call | `provision_server` ~line 2060 |
| `_port_status()` line 2861 | Direct call | Trace call sites before fixing |

**Note:** Line 1008 (`subprocess.run` inside `get_system_stats`) is NOT a problem.
`get_system_stats` is a sync helper and its only call site at line 2554 already uses
`asyncio.to_thread(get_system_stats)` correctly. Do not touch it.

---

#### P1-2. Token revocation check reads `users.json` from disk on every authenticated request — MEDIUM
**Verified at line 711.**

Inside `auth_middleware`, after validating the JWT:
```python
_users_data = load_panel_users(PANEL_DATA)   # reads + JSON-parses users.json EVERY request
_u = next((u for u in _users_data["users"] if u["username"] == sub), None)
if _u and iat < _u.get("tokens_valid_after", 0):
    return JSONResponse({"error": "Session expired"}, status_code=401)
```

Dashboard, Console, and Tracker tabs all poll every few seconds. This is dozens of disk reads
per minute per connected user.

**Recommended fix — module-level cache with invalidation:**
```python
_users_cache: dict = {}
_users_cache_ts: float = 0.0
_USERS_CACHE_TTL = 10.0  # seconds

def load_panel_users_cached(data_dir: Path) -> dict:
    global _users_cache, _users_cache_ts
    now = time.monotonic()
    if now - _users_cache_ts < _USERS_CACHE_TTL:
        return _users_cache
    _users_cache = load_panel_users(data_dir)
    _users_cache_ts = now
    return _users_cache
```

Also call `_invalidate_users_cache()` (set `_users_cache_ts = 0`) inside `save_panel_users`
so password changes and revocations propagate immediately.

---

### PHASE 2 — Quality pass (prior to wider distribution)

#### P2-1. `write_config()` not atomic — MEDIUM
**Verified still open at line ~1090.**
```python
config_path.write_text(json.dumps(data, indent=2))  # direct write, no tmp-then-rename
```
If the process is killed mid-write, `config.json` is corrupted and the Arma server won't start.
Fix: use the same `tmp = path.with_suffix('.tmp'); tmp.write_text(...); tmp.replace(path)` pattern
used by every other JSON store in the file.

There are approximately 12 additional non-atomic `.write_text()` calls beyond `write_config`.
Fix `write_config` first (highest impact), then sweep the rest.

#### P2-2. No `logging` module — MEDIUM
**Confirmed.** `import logging` is absent. The file uses ~6 `print()` calls and ~30 bare
`except: pass` or `except: ...` blocks that silently swallow errors. When the panel behaves
unexpectedly in production, there is nothing useful in `journalctl -u sitrep-api` beyond
uvicorn's access log.

Minimum viable fix:
```python
import logging
logging.basicConfig(
    level=os.environ.get("SITREP_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger("sitrep")
```
Then replace bare `except: pass` in auth middleware and critical helpers first.

#### P2-3. `_global_rate` dict grows unbounded — LOW
**Verified still open at lines 427–428.**
Every IP that has ever hit the panel gets a permanent key in `_global_rate`. On a LAN deployment
harmless. On an internet-exposed panel it's a slow memory leak.

One-line fix: after `dq.popleft()`, add:
```python
if not dq:
    del _global_rate[ip]
```

#### P2-4. `shlex.quote` missing in startup params — MEDIUM
**Verified still open. `shlex` not imported anywhere.**
Line ~4208: `new_line += f" -{key} {val}"` — no quoting on `val`. A path with spaces in it
(common on Windows-originated configs) silently corrupts the `ExecStart` line.
Fix: `import shlex` at the top, then `new_line += f" -{key} {shlex.quote(str(val))}"`.

#### P2-5. Permission check missing on `GET /api/profile/config` — MEDIUM
**Verified still open at line ~2812.**
The GET handler has no `require_permission()` call. Any authenticated user including `demo`
role can read JSON files under `arma_dir`. The write sibling at ~2823 correctly checks
`require_permission("admins.write")`.
One-line fix: add the same permission check to the GET handler.

#### P2-6. `PERMISSION_DEFAULTS` missing `server.status` key — LOW
**Verified still open.** `require_permission("server.status")` at line ~4333 is called but the
key is not defined in `PERMISSION_DEFAULTS`. Falls through to the hardcoded `"admin"` default
in `require_permission()`, which means the behavior is correct but fragile — a future refactor
of the default could silently open or close access.
Fix: add `"server.status": ["admin", "head_admin", "owner"]` to `PERMISSION_DEFAULTS`.

#### P2-7. `SECRET_KEY` env var documented but ignored — LOW
`.env.example` documents `SECRET_KEY=your-secret-here` as an override. `get_or_create_secret()`
at lines 345–352 never reads `os.environ`. Either honor it or remove the hint.

#### P2-8. `datetime.utcnow()` deprecated — LOW (not urgent today)
**Verified: 7 instances at lines 314, 1639, 1906, 3674, 4248, 4280, 4855.**
Deprecated in Python 3.12 (warns), scheduled for removal in a future version.
Fix: `datetime.now(timezone.utc).isoformat()`. The `timezone` import is already available
via `from datetime import datetime` — add `timezone` to that import.

#### P2-9. Venv drift — install.sh vs live system — BLOCKER for public release
The live systemd service uses `backend/.venv/` (uv-managed). `install.sh` creates
`backend/venv/` (pip) and writes a unit file pointing at `venv/bin/uvicorn`.
Running `install.sh` on the dev machine right now would switch the live service back to pip.

Both venvs exist and have the same packages — nothing is broken today — but they will
diverge. Pick one before distributing:
- **uv (recommended):** Update `install.sh` to `uv sync`, write unit file to `.venv/bin/uvicorn`
- **pip:** Delete `.venv/`, update unit file back to `venv/bin/uvicorn`, delete `pyproject.toml`

#### P2-10. WebSocket JWT in URL query — LOW
`/ws?token=<jwt>` passes the access token in the URL, which appears in server logs and
browser history. Standard fix: issue a short-lived single-use ticket via
`POST /api/ws-ticket` (returns a 30-second opaque token), pass that in the URL instead.

#### P2-11. No Content-Security-Policy header — LOW
Security headers middleware at line ~763 sets X-Frame-Options, X-Content-Type-Options,
and Referrer-Policy but no CSP. Add:
```python
response.headers["Content-Security-Policy"] = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:"
)
```
Adjust `connect-src` if you use external CDN resources.

---

### PHASE 3 — Architecture (can defer indefinitely without breaking anything)

#### P3-1. 53 routes use raw `request.json()` instead of Pydantic models
Only 6 `BaseModel` subclasses exist. Everything else does `body = await request.json()` and
accesses keys directly — losing FastAPI's validation, OpenAPI docs, and `TestClient` support.
Migrate one endpoint group at a time (auth first, then servers, etc.).

#### P3-2. Auth via middleware `request.state` instead of `Depends()`
`auth_middleware` sets `request.state.user`; endpoints call `current_user(request)`.
The idiomatic FastAPI pattern uses `Depends(require_user)` — makes each endpoint independently
testable without module-level mocks. Migrate alongside P3-1.

#### P3-3. `main.py` is a 6,248-line monolith
Correct fix: FastAPI router extraction, one subsystem per PR. Suggested layout in prior audit
`BACKEND_AUDIT_2026-04-11.md §N-6`. Do not do a big-bang extraction — the frontend tabs/
extraction left half-done work and caused session confusion.

#### P3-4. No CI
No GitHub Actions. A minimal pipeline would be: `ruff` lint + `pytest` + one smoke test
(hit `/api/health` after `python -m uvicorn backend.main:app`).

---

## 4. AI GM stub

`aigm_opord_load` (lines 5400–5404) is a confirmed no-op stub:
```python
@app.post("/api/aigm/opord/load")
async def aigm_opord_load(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    return {"status": "loaded"}   # no logic
```
If the AI GM tab calls this endpoint and expects real behavior, it silently does nothing.
Either implement it or ensure the frontend doesn't depend on it.

---

## 5. Corrections to earlier audits (do not rely on the earlier docs)

| Earlier claim | Actual status |
|---|---|
| C-1: cookies missing `secure=True` — "still open" | **WRONG — already fixed.** `COOKIE_SECURE` is auto-detected from `PANEL_URL` and applied consistently at all 4 cookie-setting sites. |
| Line 1008 `get_system_stats` listed as blocking | **WRONG.** Its only call site (line 2554) already wraps it in `asyncio.to_thread`. |
| Line 784 attributed to `_run_diagnostics()` | **WRONG function name.** Correct: `_sudo_probe()`. Same line, same problem. |
| `datetime.utcnow()` — "single site" | **WRONG count.** 7 instances confirmed. |
| 17 blocking calls | **Off by one.** 16 real problems (line 1008 is not one). |

---

## 6. Recommended session structure

### Session A — Stability (do now)
1. Backup (tag + tarball) — before anything else
2. Fix 16 blocking async call sites (`asyncio.to_thread` wrappers)
3. Add in-memory cache to token revocation check (line 711)
4. Commit to `dev`, push, tell Mark

### Session B — Quality
5. Fix `write_config()` and the other ~11 non-atomic writes
6. Add `logging` module, replace bare `except: pass` in critical paths
7. Fix `_global_rate` memory leak (one line)
8. Fix `shlex.quote` in startup params
9. Add permission check to `GET /api/profile/config`
10. Fix 7 `datetime.utcnow()` calls
11. Resolve venv drift (pick uv or pip, update `install.sh`)
12. Commit to `dev`, push, tell Mark

### Session C — Hardening (optional, can defer)
13. Pydantic models for highest-traffic write endpoints
14. `Depends()`-based auth (migrate alongside pydantic)
15. Content-Security-Policy header
16. WebSocket ticket flow
17. `SECRET_KEY` env var (implement or document as not supported)
18. `PERMISSION_DEFAULTS` — add `server.status` key
19. Bump Pillow and PyJWT

---

## 7. File/repo hygiene (safe to do anytime, no logic changes)

These exist on disk but are not tracked in git. Safe to delete:
- `/opt/panel/final_test/` — empty dev artifact directory
- `/opt/panel/test_patterns/` — dev artifact directory
- `/opt/panel/test.pyc` — compiled artifact (check `git ls-files | grep test.pyc` first)

These are tracked by git but shouldn't be (or `.gitignore` is missing them):
- Check and clean up `.gitignore` if `Thumbs.db` or `.DS_Store` appear in `git status`

---

## 8. Quick reference — file layout

```
/opt/panel/
├── backend/
│   ├── main.py          # 6,248-line FastAPI app — the entire backend
│   ├── .venv/           # LIVE venv (uv-managed) — do not delete
│   ├── venv/            # OLD venv (pip) — safe to delete after deciding §P2-9
│   ├── data/            # JSON stores + SQLite DBs — not in git, don't commit
│   ├── pyproject.toml   # uv deps
│   ├── uv.lock
│   └── tests/           # 47 tests, all passing
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # routing shell (~200 lines)
│   │   ├── tabs/        # one .jsx per tab — this is the live code
│   │   ├── api.js
│   │   ├── constants.js
│   │   ├── ctx.jsx
│   │   └── hooks.js
│   └── dist/            # built output, served by backend — rebuild after frontend changes
├── .env                 # PANEL_URL + PLAYERTRACKER_API_KEY — not in git
├── install.sh           # Ubuntu 22.04+ installer
├── servers/             # per-server instance dirs — not in git
└── docs/
    └── BACKEND_AUDIT_FINAL_2026-04-11.md   ← this file
```

---

*Two independent audits + one verification pass. This document is the source of truth.*
*Do not reference the earlier audit files — they contain confirmed errors.*
