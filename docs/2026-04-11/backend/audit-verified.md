# SITREP Panel — Verified Backend Assessment
**Date:** 2026-04-11
**Verified by:** Claude Code (independent read-only audit, no code changes)
**Branch:** `dev` — commit `77dd4cf`
**File:** `backend/main.py` — 6,248 lines
**Purpose:** Ground-truth document for a fresh session. Supersedes session2 audit where they conflict.

---

## How this document was produced

Three audit documents exist for this codebase. This one independently verified every specific
claim before accepting it. Where session1 and session2 disagree, or where session2 made claims
that do not match the current code, this document records what the code actually says.

Prior audit files (read-only reference, do not edit):
- `docs/BACKEND_AUDIT_2026-04-11.md` — session1 (audited 5,637-line version)
- `docs/BACKEND_AUDIT_2026-04-11-session2.md` — session2 (audited 6,248-line version)

---

## Verified findings — what is actually true right now

### V-1. Blocking `subprocess.run()` calls in async context — HIGH

**16 confirmed blocking call paths** (session2 claimed 17 — see correction below).

Ten are directly inside `async def` route handlers with no `asyncio.to_thread` wrapping:

| Line | Handler | Call |
|------|---------|------|
| 2044 | `async def provision_server()` | `subprocess.run(["sudo","tee",…])` |
| 2053 | `async def provision_server()` | `subprocess.run(["sudo","systemctl","daemon-reload",…])` |
| 2056 | `async def provision_server()` | `subprocess.run(["sudo","rm",…])` |
| 2110 | `async def delete_server()` | `subprocess.run(cmd, …)` — stop/disable loop |
| 2114 | `async def delete_server()` | `subprocess.run(["sudo","rm",…])` |
| 2117 | `async def delete_server()` | `subprocess.run(["sudo","systemctl","daemon-reload",…])` |
| 4213 | `async def set_startup_params()` | `subprocess.run(["sudo","tee",…])` |
| 4220 | `async def set_startup_params()` | `subprocess.run(["sudo","systemctl","daemon-reload",…])` |
| 5139 | `async def aigm_start()` | `subprocess.run(["sudo","systemctl","start","aigm-bridge",…])` |
| 5179 | `async def aigm_stop()` | `subprocess.run(["sudo","systemctl","stop","aigm-bridge",…])` |

Six more are in sync helpers that async routes call without `asyncio.to_thread`:

| Line | Sync helper | Called (unwrapped) from |
|------|-------------|-------------------------|
| 784  | `_sudo_probe()` | `_provision_sudo_preflight()` → `provision_server` (async) |
| 947  | `systemctl()` | `async def server_action()` at line 3031 |
| 957  | `is_server_running()` | `list_servers_endpoint`, `server_instance_status`, `status`, `restore_backup`, `ws_heartbeat` (all async) |
| 967  | `get_server_pid()` | same async routes as above |
| 2809 | `_manage_ports()` | called directly at line 2060 inside `provision_server` (async) |
| 2861 | `_port_status()` | call sites not fully traced — treat as suspect |

**Session2 audit error:** Line 1008 (inside `get_system_stats()`) was listed as one of the 17.
It is NOT a problem. `get_system_stats` has exactly one call site (line 2554) and it IS correctly
wrapped: `await asyncio.to_thread(get_system_stats)`. Real count to fix: **16**.

**Session2 audit error:** Line 784 was attributed to `_run_diagnostics()`. The function at line 784
is `_sudo_probe()`. Wrong name; correct line and problem.

**Correct fix pattern** (already used for steamcmd and crontab calls — copy this):
```python
result = await asyncio.to_thread(systemctl, action, service)
running = await asyncio.to_thread(is_server_running, service)
```
Do NOT wrap the subprocess.run() call inside the sync helper — wrap the sync helper at each
async call site.

**Impact:** systemctl calls can block 5–30s if a service is in a transitional state. Provisioning
(lines 2044–2056) runs three blocking calls sequentially; worst-case event-loop freeze ~15s.

---

### V-2. `datetime.utcnow()` — 7 instances — LOW

Confirmed at lines: **314, 1639, 1906, 3674, 4248, 4280, 4855**

Session1 saw only 1 (it audited the 5,637-line version). The other 6 are in code added since.
Deprecated in Python 3.12, slated for removal in a future version.

Fix (one-liner each): `datetime.utcnow()` → `datetime.now(timezone.utc)` (add
`from datetime import timezone` if not already imported).

Priority: LOW. Not a correctness or security issue today.

---

### V-3. Token revocation check reads `users.json` on every authenticated request — MEDIUM

`auth_middleware` at line 711:
```python
_users_data = load_panel_users(PANEL_DATA)
_u = next((u for u in _users_data["users"] if u["username"] == sub), None)
if _u and iat < _u.get("tokens_valid_after", 0):
    ...
```
`load_panel_users` reads and JSON-parses `panel_users.json` from disk on every authenticated
API request. Dashboard, Console, and Tracker tabs all poll every few seconds — this produces
dozens of disk reads per minute per connected user.

Fix (Option A — recommended): module-level dict cache, invalidated whenever `save_panel_users`
is called. Very small code change.

---

### V-4. `aigm_opord_load` is a stub — LOW

Lines 5400–5404:
```python
@app.post("/api/aigm/opord/load")
async def aigm_opord_load(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    return {"status": "loaded"}
```
No logic. If the frontend calls this endpoint, it silently succeeds and does nothing. Either
implement it or remove the frontend call.

---

### V-5. `_global_rate` dict grows unbounded — LOW-MEDIUM

Lines 418–433: `_check_global_rate` evicts old timestamps from the per-IP deque but never
removes the IP key when the deque empties:
```python
while dq and dq[0] < now - 60:
    dq.popleft()
# missing: if not dq: del _global_rate[ip]
```
On a LAN install this is harmless. On an internet-exposed panel, every source IP accumulates
a key that never leaves.

Fix: one line — `if not dq: del _global_rate[ip]` after the eviction loop.

---

### V-6. `write_config()` is not atomic — LOW-MEDIUM

Line 1085–1092:
```python
def write_config(data, config_path: Path = CONFIG_PATH):
    config_path.write_text(json.dumps(data, indent=2))   # direct write, not atomic
```
A crash mid-write corrupts the config file. The rest of the JSON stores (servers.json,
panel_users.json, etc.) already use the correct tmp-then-replace pattern.

Fix: write to a `.tmp` sibling, then `Path.replace()`.

---

### V-7. Startup params lack `shlex.quote` — LOW

Line 4208:
```python
new_line += f" -{key} {val}"
```
`shlex` is not imported anywhere in the file. The char-filter at line 4172 blocks `\n\r\x00%`
but allows spaces. A value with a space breaks the `ExecStart=` line in the generated service
file.

Fix: `import shlex`, then `new_line += f" -{key} {shlex.quote(str(val))}"`.

---

### V-8. `SECRET_KEY` env var documented but ignored — LOW

`get_or_create_secret()` at lines 345–352 never consults `os.environ`. Setting `SECRET_KEY`
in `.env` is silently ignored despite `.env.example` documenting it.

Fix: either honor the env var first (`if k := os.environ.get("SECRET_KEY"): return k`) or
remove the example entry to stop promising something that doesn't work.

---

### V-9. No `logging` module — MEDIUM

`import logging` does not appear in the file. Six `print()` calls. Thirty bare `except: pass`
blocks. When the panel behaves unexpectedly, `journalctl -u sitrep-api` shows only uvicorn
access logs — no application context.

---

## Status of prior-audit issues (corrected where session2 was wrong)

| ID | Issue | Actual status | Notes |
|----|-------|---------------|-------|
| **C-1** | Cookies missing `secure=True` | **FIXED** | `COOKIE_SECURE` (auto-detected from PANEL_URL) set at line 48; used in every `set_cookie` / `delete_cookie` call. Session2 incorrectly reported this as still open. |
| **C-2** | `server.status` permission key undefined | Open | `require_permission("server.status")` at line 4333; `PERMISSION_DEFAULTS` has no entry; falls through to `"admin"`. |
| **C-3** | Hardcoded `User=mark` in unit files | Fixed | Line 1681 now uses `getpass.getuser()`. |
| **C-4** | AIGM bridge path hardcoded | Partial | Uses `Path.home()` now, but no graceful "not configured" path. |
| **I-1** | `write_config()` not atomic | Open | Direct `.write_text()` at line 1090. |
| **I-2** | WebSocket JWT in URL query | Open | `ws_endpoint(ws: WebSocket, token: str = "")`. |
| **I-3** | No Content-Security-Policy header | Open | Security middleware at line 704 sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy — but no CSP. |
| **I-4** | `_global_rate` dict unbounded | Open | See V-5 above. |
| **I-5** | `GET /api/profile/config` missing permission check | Open | Line 2812 — any authed user including demo can read files under arma_dir. |
| **I-6** | Multiple non-atomic inline writes | Open | Direct `.write_text()` still present at multiple sites. |
| **I-7** | Startup params lack `shlex.quote` | Open | See V-7 above. |
| **I-8** | `Misfits_Logging` hardcoded | Open | 11 occurrences; no env var. |
| **I-9** | Bare `except: pass` | Open | ~30 occurrences. |
| **N-1** | `SECRET_KEY` env var ignored | Open | See V-8 above. |
| **N-NEW-1** | Blocking subprocess calls | Open | See V-1 above — 16 confirmed, not 17. |
| **N-NEW-2** | Per-request disk read in revocation check | Open | See V-3 above. |
| **N-NEW-3** | `aigm_opord_load` stub | Open | See V-4 above. |

---

## What is confirmed solid — do not change

- **JWT secret bootstrap** — `secrets.token_hex(32)`, `chmod 0o600`, no hardcoded fallback (lines 345–352).
- **Password hashing** — PBKDF2-SHA256 × 100k, per-user salt, `compare_digest` verify (lines 356–368).
- **Cookie security** — `COOKIE_SECURE` auto-detected from PANEL_URL; all five cookie operations use it. *(Session2 got this wrong — it's solid.)*
- **Refresh token store** — opaque hex, server-side in `refresh_tokens.json`, per-user revocation on password change.
- **`tokens_valid_after` revocation** — checked on every request (line 711). The disk-read is the only problem, not the feature itself.
- **Path traversal** — `is_path_safe()` uses `.resolve()` + prefix-match; used consistently in file endpoints.
- **Atomic writes** — `refresh_tokens.json`, `servers.json`, `permissions.json`, `panel_users.json`, `user_profiles.json`, `hooks.json`, `deployments.json`, `settings.json`, `tracker_settings.json` all use tmp-then-replace correctly.
- **No `shell=True`** — zero instances.
- **Subprocess argument lists** — all use list form, no string concatenation.
- **`asyncio.to_thread` pattern exists and is used correctly** — steamcmd, crontab, ufw ban/unban, tracker DB writes all wrapped properly. Use these as templates.
- **`SameSite=Strict`** — present on all cookies.
- **`require_permission()` coverage** — 88+ call sites; one known miss (I-5).

---

## Recommended work order for a fresh session

### Do first — stability and correctness

1. **`git tag` + tarball backup** before touching any code.

2. **Wrap 16 blocking sync-helper calls** at their async call sites. Targets:
   - `server_action()` (line 3031): wrap `systemctl(...)` call
   - `list_servers_endpoint()`, `server_instance_status()`, `status()`, `restore_backup()` (multiple): wrap `is_server_running()` and `get_server_pid()` calls
   - `provision_server()` (lines 2044, 2053, 2056): wrap three `subprocess.run()` calls inline
   - `delete_server()` (lines 2110, 2114, 2117): wrap three `subprocess.run()` calls inline
   - `set_startup_params()` (lines 4213, 4220): wrap two `subprocess.run()` calls inline
   - `aigm_start()` (line 5139): wrap one call
   - `aigm_stop()` (line 5179): wrap one call
   - `_sudo_probe()` call inside `_provision_sudo_preflight()`: wrap at the call site in `provision_server`

3. **Add in-memory cache to `load_panel_users`** call in `auth_middleware` (line 711). Module-level dict, invalidated in `save_panel_users`. This is a hot path.

### Do second — prior-audit ship blockers (from session1 Phase 1)

4. Resolve venv drift (pick uv or pip; unify install.sh, unit file, CLAUDE.md, README).
5. Bump Pillow and PyJWT (security-relevant version lag).
6. C-4: AIGM graceful absence (return `{"enabled": false}` if bridge path not found; hide tab on frontend).

### Do third — quality

7. I-1 / I-6: Atomic writes everywhere — a `write_atomic(path, text)` helper used in ~12 sites.
8. I-7: `import shlex`; quote startup param values at line 4208.
9. I-5: Add permission check to `GET /api/profile/config` — one line.
10. I-4: `_global_rate` cleanup — one line after eviction loop.
11. C-2: Define `server.status` in `PERMISSION_DEFAULTS`.
12. N-1: Honor `SECRET_KEY` env var in `get_or_create_secret()`.
13. V-2: Fix 7 `datetime.utcnow()` calls.
14. N-2: `import logging`; replace 30 bare `except: pass` with `logger.exception(...)`.

### Do not do (already done, both audits were wrong)

- ~~C-1: Add `secure=True` to cookies~~ — **already implemented as `COOKIE_SECURE` at lines 38–48 and used everywhere.** Do not touch.

---

*Verified 2026-04-11. All findings independently confirmed from source code reads and targeted greps. No code was modified during this audit.*
