# SITREP Backend — Independent Audit (Session 2)
**Date:** 2026-04-11
**Auditor:** Claude Code (claude-sonnet-4-6, Opus 4.6 mode)
**Branch:** `dev` — commit `77dd4cf`
**Backend size:** 6,248 lines (`backend/main.py`)
**Prior audit:** `docs/BACKEND_AUDIT_2026-04-11.md` (audited a 5,637-line version)
**Policy:** Read-only. No code changes made.

---

## 1. Key discrepancy with prior audit

The prior audit was conducted on a **5,637-line** version of `main.py`. The current file is **6,248 lines** (+611 lines added since). This matters because several of the prior audit's findings are stated as single-site — my counts differ.

| Prior audit claim | My count | Lines |
|---|---|---|
| `datetime.utcnow()` — "single site at line 301" | **7 instances** | 314, 1639, 1906, 3674, 4248, 4280, 4855 |
| "6 print() calls" | Matches ~6 | — |
| "30 bare `except: pass`" | Not recounted | — |

The discrepancy in `utcnow()` count strongly suggests new code added after the prior audit introduced additional deprecated calls.

---

## 2. New findings not in the prior audit

### N-NEW-1. 17 blocking `subprocess.run` calls in async route handlers — HIGH

This is the most significant finding and it is **not in the prior audit**.

The backend is a single-process async FastAPI/uvicorn application. Any blocking call on the main thread freezes the event loop — all users get timeouts until the blocking call returns.

These 17 `subprocess.run` calls are NOT wrapped in `asyncio.to_thread`:

| Line | Call | Context |
|---|---|---|
| 784 | `subprocess.run(...)` | `_run_diagnostics()` helper — called from async route |
| 947 | `subprocess.run(["sudo","systemctl",action,...])` | `systemctl()` sync helper |
| 957 | `subprocess.run([...])`  | `is_server_running()` |
| 967 | `subprocess.run([...])` | `get_server_pid()` |
| 1008 | `subprocess.run(["nvidia-smi",...])` | `get_system_stats()` — GPU poll |
| 2044 | `subprocess.run(["sudo","tee",...])` | Server provisioning |
| 2053 | `subprocess.run(["sudo","systemctl","daemon-reload",...])` | Server provisioning |
| 2056 | `subprocess.run(["sudo","rm",...])` | Server provisioning cleanup |
| 2110 | `subprocess.run(cmd, ...)` | Server provision/deprovision |
| 2114 | `subprocess.run(["sudo","rm",...])` | Server deprovision |
| 2117 | `subprocess.run(["sudo","systemctl","daemon-reload",...])` | Server deprovision |
| 2809 | `subprocess.run(...)` | Server config write |
| 2861 | `subprocess.run(...)` | Server management operation |
| 4213 | `subprocess.run(["sudo","tee",...])` | Startup params write |
| 4220 | `subprocess.run(["sudo","systemctl","daemon-reload",...])` | Startup params write |
| 5139 | `subprocess.run(["sudo","systemctl","start","aigm-bridge",...])` | AI GM start |
| 5179 | `subprocess.run(["sudo","systemctl","stop","aigm-bridge",...])` | AI GM stop |

**Impact:** `systemctl` calls typically return in <1s but can hang for 5–30s if the service is in a transitional state (starting, stopping). `nvidia-smi` can block up to ~2s under GPU load. During provisioning operations (lines 2044–2117), 3+ blocking calls happen in sequence, potentially blocking the event loop for 5–15s.

**The already-correct pattern** (from the same file, for comparison):
```python
# These ARE correctly wrapped — use this pattern:
r = await asyncio.to_thread(subprocess.run, [...], capture_output=True)
```

**Fix:** Wrap each blocking call in `asyncio.to_thread(subprocess.run, [...], ...)`. No logic change required.

---

### N-NEW-2. Token revocation check reads `users.json` from disk on every authenticated request — MEDIUM

In `auth_middleware` (line ~700), after validating the JWT, the middleware does:

```python
_users_data = load_panel_users(PANEL_DATA)
_u = next((u for u in _users_data["users"] if u["username"] == sub), None)
if _u and iat < _u.get("tokens_valid_after", 0):
    return JSONResponse({"error": "Session expired"}, status_code=401)
```

`load_panel_users` reads and JSON-parses `backend/data/panel_users.json` on **every authenticated API call**. On a panel with active polling (Dashboard, Console, Tracker all poll every few seconds), this means dozens of disk reads per minute per connected user.

**Fix options (pick one):**
- **A. In-memory cache with TTL** — cache the parsed users dict in a module-level variable, invalidate when `save_panel_users` is called. Very low code change, correct behavior.
- **B. Move revocation to refresh token only** — skip `tokens_valid_after` check on access tokens (short-lived 24h JWT); only check at refresh time. Simpler but weakens revocation responsiveness.

Option A is recommended. The check is a useful security feature and shouldn't be removed.

---

### N-NEW-3. `aigm_opord_load` is a stub — LOW

Line ~5401:
```python
@app.post("/api/aigm/opord/load")
async def aigm_opord_load(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    return {"status": "loaded"}
```

This endpoint returns `{"status": "loaded"}` with no logic. If the frontend calls this expecting real behavior, it silently succeeds without doing anything. Either implement it or have the frontend not call it.

---

## 3. Confirming prior audit — what I agree with

These findings from the prior audit I independently observed in my read:

| Item | My finding | Notes |
|---|---|---|
| Blocking venv drift (two venvs: `.venv/` and `venv/`) | Confirmed | `.venv/` is what runs, install.sh creates `venv/` |
| Cookies missing `secure=True` at 5 sites | Confirmed | Lines 596, 600, 1054, 1363, 1364 (approx) |
| `write_config()` not atomic | Confirmed | Direct `.write_text()` |
| WebSocket JWT passed in URL query | Confirmed | `/ws?token=...` |
| No Content-Security-Policy header | Confirmed | Security middleware missing it |
| `_global_rate` unbounded dict | Confirmed | No cleanup when deque empties |
| 30+ bare `except: pass` | Confirmed (not recounted) | Pattern seen throughout |
| No `logging` module | Confirmed | `import logging` absent |
| `PERMISSION_DEFAULTS` missing `server.status` | Confirmed | Falls through to admin default |
| `/api/profile/config` GET missing permission check | Confirmed | Any authed user including demo |
| Atomic writes on all JSON stores | Confirmed correct — do not change |
| No `shell=True` | Confirmed correct — do not change |
| Good auth middleware structure | Confirmed correct |
| Path traversal protection | Confirmed correct |
| PBKDF2 password hashing | Confirmed correct |
| Refresh token revocation on password change | Confirmed correct |

---

## 4. Things I did NOT find (prior audit may have been right for its version)

- **No dead code.** The static analysis initially flagged 9 private functions as uncalled, but every one of them is passed as a function reference to `asyncio.to_thread()` or `run_in_executor()`. This is invisible to AST analysis. The backend has no dead code.
- **No `shell=True`.** Zero instances. Confirmed.
- **No `verify=False`** in any httpx client (the workshop/Bohemia CDN clients that had it were fixed in a prior commit).

---

## 5. Bottom line — what this session adds to the prior audit

The prior audit is accurate for the code it saw. The backend grew by 611 lines since, and the growth introduced:

1. **The blocking subprocess pattern** — existing sync helpers (`systemctl`, `is_server_running`, `get_system_stats`) were always called from sync context before; as async routes calling them multiplied, no one wrapped them. This is the one issue that can cause real user-facing degradation under normal operation.
2. **Additional `datetime.utcnow()` calls** — 6 new sites vs the 1 the prior audit saw.
3. **The per-request disk read** — the `tokens_valid_after` revocation check is a good feature but needs an in-memory cache before the panel is under any real load.

Everything else in the prior audit remains accurate and open. The recommended order is:

**Do first (stability/correctness):**
1. Backup (`git tag` + tarball)
2. Wrap 17 blocking `subprocess.run` calls in `asyncio.to_thread`
3. Fix 7 `datetime.utcnow()` calls
4. Add in-memory cache to the token revocation check

**Do second (prior audit Phase 1 items — ship blockers):**
5. Resolve venv drift (pick uv or pip, unify install.sh)
6. Fix `secure=True` on cookies
7. Bump Pillow and PyJWT

**Everything else per the prior audit's phased plan.**

---

*Audit methodology: direct read of `backend/main.py` (full function/route map), grep-based pattern searches, AST parse for syntax and function inventory, git log review. No code was modified.*
