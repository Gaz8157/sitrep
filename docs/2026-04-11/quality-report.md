# SITREP Panel — Quality & Security Audit Report

**Date:** 2026-04-10  
**Audited files:** `backend/main.py` (~4900 lines), `frontend/src/App.jsx` (~3500 lines)  
**Purpose:** Pre-packaging production readiness assessment  
**Status:** ⚠️ FIXES REQUIRED before public distribution

---

## Summary

The panel has a solid architectural foundation — the auth system, permission model, and path traversal protections are all correctly designed. The frontend has zero XSS attack surface. However, several issues must be resolved before the panel can be safely distributed to other users installing it on their own machines. Two issues are blockers; several more are important quality fixes.

---

## Critical — Must Fix Before Release

### C-1: Missing `secure=True` on auth cookies

**File:** `backend/main.py:464–471, 886, 1000–1001`

Auth cookies (`sitrep-access`, `sitrep-refresh`) are set without `secure=True`. On HTTPS deployments (the expected production configuration), if the user visits the panel via plain HTTP before being redirected to HTTPS, or if a reverse proxy is misconfigured, the browser will transmit these HttpOnly cookies over an unencrypted connection. This negates the primary auth security model.

All four `set_cookie` call sites are missing the flag:
- `set_auth_cookies()` at line 464/468 (the primary helper — covers most flows)
- Refresh endpoint inline at line 1000–1001
- Discord OAuth inline at line 886

**Fix:** Add `secure=True` to all six `set_cookie` calls. For local-network deployments (HTTP-only), this can be controlled by an env var (`COOKIE_SECURE=false`), but the default must be `True`.

---

### C-2: `server.status` permission name not defined in `PERMISSION_DEFAULTS`

**File:** `backend/main.py:3879` (used), `main.py:185–196` (PERMISSION_DEFAULTS — not present)

The RCON players endpoint uses `require_permission(request, "server.status")`. This key does not exist in `PERMISSION_DEFAULTS`. The fallback in `require_permission()` (line 319) is:

```python
min_role = load_permissions(PANEL_DATA).get(perm, PERMISSION_DEFAULTS.get(perm, "admin"))
```

Because `"server.status"` is absent from both `load_permissions()` output and `PERMISSION_DEFAULTS`, this falls through to the hardcoded default `"admin"`. This is actually safe behavior (defaults to restrictive), but it is a latent bug: the permission cannot be customized through the permissions UI (it won't appear), and the fallback-to-"admin" behavior is invisible to the administrator.

**Fix:** Add `"server.status": "viewer"` to `PERMISSION_DEFAULTS` and `PERMISSION_LABELS` and `PERMISSION_GROUPS["Server"]`. This makes it visible and configurable.

---

### C-3: Hardcoded `User=mark` in generated systemd service files

**File:** `backend/main.py:1311`

When the panel creates a new Arma Reforger server instance via `/api/servers`, it generates a systemd service file with a hardcoded `User=mark`. Any other installer will have this service running under the wrong user, causing permission failures when the server tries to access its install directory or write logs.

**Fix:** Replace the hardcoded value with a configurable env var:
```python
SERVICE_USER = os.environ.get("SERVICE_USER", os.getenv("USER", "arma"))
# Then in service template:
f"User={SERVICE_USER}"
```
Add `SERVICE_USER` to `.env.example`.

---

### C-4: Hardcoded `/home/mark/` paths for AI GM bridge

**File:** `backend/main.py:4167`

```python
AIGM_BRIDGE_PATH = Path(os.environ.get("AIGM_BRIDGE_PATH", "/home/mark/AIGameMaster/AIGameMaster/bridge.py"))
```

The default fallback is a path that only exists on the developer's machine. While this is an env-var override, a first-time installer who doesn't set `AIGM_BRIDGE_PATH` will see confusing errors from the AI GM tab with no indication of what's wrong.

**Fix:** Change the default to a relative path or an explicit `""` with a startup check that disables AI GM features gracefully if the path is unset/invalid:
```python
AIGM_BRIDGE_PATH = Path(os.environ.get("AIGM_BRIDGE_PATH", ""))
```

---

## Important — Should Fix Before Release

### I-1: Non-atomic `write_config()` for `config.json`

**File:** `backend/main.py:717–723`

```python
def write_config(data, config_path):
    if config_path.exists():
        shutil.copy2(config_path, config_path.with_suffix('.json.bak'))
    config_path.write_text(json.dumps(data, indent=2))  # ← not atomic
```

Between the backup copy and the `write_text()`, a kill or disk-full event produces a truncated/corrupted `config.json`. The `.bak` file exists but the main file is gone.

Other critical writes in the codebase (refresh tokens, permissions, servers) correctly use the tmp-then-replace pattern. `write_config()` should match:

```python
tmp = config_path.with_suffix('.json.tmp')
tmp.write_text(json.dumps(data, indent=2))
tmp.replace(config_path)
```

Additionally, lines 1286 and 1302 also call `config_path.write_text(...)` directly without atomicity. Both need the same fix.

---

### I-2: WebSocket token exposed in URL query parameter

**File:** `backend/main.py:4132`, `frontend/src/App.jsx` (WebSocket connect)

```python
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = ""):
```

The full 24h JWT is passed as `?token=...` in the URL. This appears in:
- Server access logs (nginx, uvicorn)
- Browser history
- Referrer headers if the panel loads third-party resources

**Fix (production-grade):** Issue a short-lived single-use ticket via `POST /api/ws-ticket` that returns an opaque random token mapped server-side; pass that ticket in the URL instead of the JWT. Ticket expires in 30 seconds, consumed on first WebSocket accept.

**Fix (acceptable for self-hosted):** At minimum, document that access logs will contain tokens and rotate access tokens more aggressively (e.g., 1h instead of 24h).

---

### I-3: No Content-Security-Policy header

**File:** `backend/main.py:561–567`

Security headers middleware sets `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` but not CSP. For a self-hosted SPA this is low-urgency, but a CSP defends against supply-chain attacks on frontend dependencies.

```python
response.headers["Content-Security-Policy"] = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "   # needed for Vite prod chunks
    "style-src 'self' 'unsafe-inline'; "
    "connect-src 'self' ws: wss:; "
    "img-src 'self' data: https://cdn.gametools.network https://cdn.arma.bohemia.com blob:; "
    "frame-ancestors 'none';"
)
```

---

### I-4: `_global_rate` dict grows unbounded

**File:** `backend/main.py:394–415`

Each unique IP address is added to `_global_rate` and the deque is pruned of old timestamps but the IP entry itself is never removed. On a public-facing deployment receiving traffic from thousands of different IPs (scanner bots, etc.), this is an unbounded memory leak.

**Fix:** After pruning the deque, remove the entry if it becomes empty:
```python
while dq and dq[0] < now - 60:
    dq.popleft()
if not dq and ip in _global_rate:
    del _global_rate[ip]
```

---

### I-5: `read_profile_config` endpoint has no permission check

**File:** `backend/main.py:2358–2367`

`GET /api/profile/config` uses `is_path_safe()` for path traversal protection but has no `require_permission()` call. Any authenticated user (including `demo` role) can read arbitrary files within the Arma install and profile directories. The write endpoint at line 2370 correctly requires `admins.write`.

**Fix:** Add before the path safety check:
```python
denied = require_permission(request, "files.read")
if denied: return denied
```

---

### I-6: Multiple non-atomic inline config writes

**File:** `backend/main.py:1286, 1302, 2219`

Beyond `write_config()`, three additional `write_text()` calls on config files are not atomic:
- Line 1286: server registration config write
- Line 1302: default config creation  
- Line 2219: MAT admins file (`_save_mat_admins`)

Apply the tmp-then-replace pattern to each.

---

### I-7: Startup params written without `shlex.quote()`

**File:** `backend/main.py:3307–3312`

```python
new_line = f"{ARMA_EXE} -config {config_path} -profile {profile_path}"
for key, val in current.items():
    new_line += f" -{key} {val}"   # val not shell-quoted
```

A value containing spaces (e.g., a path with spaces) will break the `ExecStart` line. While the bad-char filter blocks `\n`, `\r`, `\x00`, and `%`, spaces are permitted.

**Fix:**
```python
import shlex
new_line += f" -{key} {shlex.quote(str(val))}"
```

---

### I-8: `_mat_admins_path` is hardcoded to `Misfits_Logging`

**File:** `backend/main.py:2208, 3038, 3068, 3087, 3111, 4687, 4731, 4750, 4783, 4803`

The Misfits Admin Tools (MAT) integration hardcodes the profile subdirectory `Misfits_Logging` throughout. Other server operators using a different admin mod, or a different mod name, will have broken functionality with no clear error message.

**Fix:** Make this configurable via env var or server settings:
```python
MAT_PROFILE_DIR = os.environ.get("MAT_PROFILE_DIR", "Misfits_Logging")
```

---

### I-9: Bare `except: pass` in critical paths

**File:** `backend/main.py` — multiple locations

The following critical paths silently swallow all exceptions with no logging:
- `load_permissions()` line 229: permission system failure is invisible
- `_get_build_id()` line 4488: uses stale build ID with no log
- `fetch_page()` in `_build_ws_index()` line 4456: failed pages silently drop mods
- Various file read/write helpers

**Fix:** Replace `except: pass` with `except Exception: logger.exception("context")` in all paths that affect core functionality. For packaging, operators need to be able to diagnose issues from logs.

---

## Minor — Nice to Have

### M-1: `verify=False` on workshop httpx clients needs a comment

**File:** `backend/main.py:4481, 4450, 4586, 4611`

The SSL bypass is correctly scoped to only the four clients reaching `reforger.armaplatform.com` and is appropriate (Bohemia's CDN has certificate chain issues). Future maintainers will flag this as a vulnerability without context.

**Fix:** Add a single-line comment above each call:
```python
# verify=False: Bohemia's workshop CDN has an incomplete cert chain; curl also bypasses this
async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as c:
```

---

### M-2: `_ws_cache` has no max-size eviction

**File:** `backend/main.py` — `_ws_cache` dict

Workshop search results cache grows unbounded. For a single-user self-hosted panel this is harmless, but worth a `maxlen` cap for robustness.

---

### M-3: CORS computed once at startup

**File:** `backend/main.py:547`

CORS origin list is built from `PANEL_URL` at startup. If the operator changes `PANEL_URL` in `.env`, they must restart the backend. This should be documented in the setup guide.

---

### M-4: `panel_users.json` and `secret.key` created in `/opt/panel/backend/data/`

**File:** `backend/main.py:43, 98`

`PANEL_DATA` is hardcoded to `/opt/panel/backend/data/`. For a packaged distribution, this directory should be configurable (e.g., `PANEL_DATA_DIR` env var) so the panel can be installed anywhere, and data separated from the application code.

---

### M-5: Frontend — no loading/error state on Workshop index build

**File:** `frontend/src/App.jsx` — Mods component

When the workshop index is building (status: "building"), the panel shows nothing with no progress indicator. Users have no feedback that the background index is populating. Should show a progress bar or counter from the `index_count` field returned by `/api/workshop/index/status`.

---

## What Is Correct (Do Not Change)

- **JWT secret generation** — `secrets.token_hex(32)` at first run, `chmod 0o600`, no hardcoded fallback. Correct.
- **Password hashing** — PBKDF2-SHA256, 100,000 iterations. Appropriate for a self-hosted tool.
- **Refresh token model** — Opaque hex ID, server-side store, per-user revocation on password change. Correct.
- **SameSite=Strict** — Prevents CSRF for all cookie-auth requests. Correct.
- **Path traversal** — `is_path_safe()` using `Path.resolve()` applied consistently. Correct.
- **Permission system** — Role hierarchy + per-action overrides + demo isolation. Well-designed.
- **Atomic writes** — `refresh_tokens.json`, `servers.json`, `permissions.json`, `hooks.json`, `settings.json` all use tmp-then-replace. Correct.
- **Rate limiting** — Two tiers (global sliding window + login lockout). Correct.
- **Frontend security** — No `dangerouslySetInnerHTML`, no `eval`, no `innerHTML`. No credentials in localStorage. Correct.
- **Workshop `verify=False` scope** — Correctly limited to only the four Bohemia requests, not applied globally. Correct.

---

## Production Readiness Verdict

| Category | Status |
|---|---|
| Auth architecture | ✅ Sound |
| Cookie security (HTTPS) | ❌ Missing `secure=True` |
| Permission system | ⚠️ One undefined key (`server.status`) |
| Path traversal protection | ✅ Sound |
| Input validation | ⚠️ `shlex.quote` missing in one path |
| Hardcoded paths | ❌ `User=mark`, `/home/mark/` defaults |
| Atomic file writes | ⚠️ `write_config()` and 3 other sites not atomic |
| Frontend XSS | ✅ None |
| Rate limiting | ✅ Sound |
| Error visibility | ⚠️ Many bare `except: pass` blocks |
| Packaging readiness | ❌ Not ready (C-1, C-3, C-4 are blockers) |

**Ready to package: No.**  
Fix C-1 through C-4 before any distribution. I-1 through I-9 should be resolved before public release but do not block a private/trusted deployment.
