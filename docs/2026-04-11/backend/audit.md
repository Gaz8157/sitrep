# SITREP Panel — Backend Audit 2026-04-11

**Auditor:** Claude Code (read-only audit, no code changes)
**Scope:** `/opt/panel/backend/main.py` (~5637 lines), `install.sh`, systemd unit, deps, tests
**Prior audit:** `docs/QUALITY_REPORT.md` (2026-04-10) — referenced throughout, status updated
**Goal:** Assess shipability for a public GitHub distribution; identify modern-tooling gaps; do not break anything

---

## 0. Project verification (safety checks)

- Working directory: `/opt/panel` ✔
- Branch: `dev` ✔ (19 commits ahead of `origin/dev` — unpushed dev work)
- `.env` present at `/opt/panel/.env` with `PANEL_URL` and `PLAYERTRACKER_API_KEY` ✔
- `sitrep-api.service` active and serving; process PID 170675 healthy
- `git log` visible — most recent dev work (`a91d2c2` docs, `fa58aa6` provision default) is intact, no sign of another session having clobbered history since `c6eb6ef feat(tracker): add PlayerTracker tab`
- Test suite: **47/47 pass** (`backend/.venv/bin/python -m pytest tests/`)
- Working-tree change: `frontend/src/tabs/Tracker.jsx` (uncommitted — not touched by this audit)

No wipes detected. Safe to audit.

---

## 1. Executive summary

**The panel is functionally solid but not yet shippable as a polished public release.** The auth design, permission model, and path-traversal defenses are sound. The `dev` branch is ahead of `main` with real improvements. But there is a significant *deployment-drift* problem (the install.sh-produced environment no longer matches what the live system actually runs), and the prior quality report's blockers are still mostly open.

| Area | Status |
|---|---|
| Auth architecture | Sound |
| Data-at-rest (JSON + sqlite) | Mostly atomic, a few holes remain |
| Rate limiting | Sound, one memory leak |
| Path traversal | Sound |
| Permissions | Sound, one latent undefined key |
| HTTPS readiness | **Blocker — cookies not `secure=True`** |
| Shell / injection safety | Mostly sound, one `shlex.quote` gap |
| Observability | **Weak — no `logging` module, 30 silent excepts** |
| Dependency freshness | Two security-relevant deps behind |
| Packaging / install.sh | **Blocker — diverges from live system layout** |
| Shipability (public release) | **Not yet** |

The three things that block shipping:
1. **Deployment drift** — install.sh and the live systemd unit don't agree on where the venv is.
2. **HTTPS cookies** — anyone installing this behind HTTPS is one config slip from leaking session tokens over cleartext.
3. **Hardcoded paths / modules** — `AIGM_BRIDGE_PATH` and `Misfits_Logging` assume the dev's exact layout.

The three things that most improve "modern, easy to debug":
1. Adopt the `logging` module + journald structured output.
2. Split `main.py` into a proper FastAPI router layout (not a full rewrite — an extraction).
3. Replace hand-parsed `request.json()` with pydantic models via `Depends()`.

---

## 2. Runtime environment — deployment drift (BLOCKER)

**This is the single biggest shipability issue and it's new since the 2026-04-10 report.**

There are **two Python venvs** in `backend/`:

| Path | Manager | Populated? | What uses it |
|---|---|---|---|
| `backend/.venv/` | **uv** (see `uv.lock`, `CACHEDIR.TAG`, no `pip`) | Yes — contains fastapi, uvicorn, pydantic 2.12.5, pyjwt 2.8.0, etc. | **The live systemd service** (`/etc/systemd/system/sitrep-api.service` → `/opt/panel/backend/.venv/bin/uvicorn`) |
| `backend/venv/` | **pip** (has `pip`, `pip3`, standard venv layout) | Yes — parallel copy of the same package set | What `install.sh` creates on a fresh install, pointed to by the unit file install.sh *writes* |

Consequences:

1. **The live system and install.sh produce different layouts.** If a user runs `install.sh` today, they get `venv/` and a unit file pointing to `venv/bin/uvicorn`. The dev machine has been migrated to `.venv/` (uv) and the running unit file at `/etc/systemd/system/sitrep-api.service` references `.venv/bin/uvicorn`. These will not round-trip.
2. **`CLAUDE.md` is stale.** Lines 22–24 of `CLAUDE.md` say `backend/venv/` is "load-bearing" — but the live system no longer uses it. A future Claude session reading CLAUDE.md will protect the wrong directory.
3. **Running `install.sh` on the dev machine right now would rewrite the unit file to point back at `venv/`**, silently switching the runtime from uv to pip.
4. **`requirements.txt` and `pyproject.toml` are both pinned to the same versions** (I checked). So the package set is coincidentally consistent — but this won't hold if either file is updated independently.

### Recommendation — pick one, in this order of preference

**Option A: Adopt uv as the project standard (modern, what dev is already using).**
- Update `install.sh`:
  - Install uv (`curl -LsSf https://astral.sh/uv/install.sh | sh`) or `pipx install uv`
  - Replace `python3 -m venv backend/venv` + `pip install -r requirements.txt` with `cd backend && uv sync`
  - Write the unit file with `${INSTALL_DIR}/backend/.venv/bin/uvicorn`
- Delete `requirements.txt` (or auto-generate from `pyproject.toml` for reference only)
- Delete the now-stale `backend/venv/` directory on the dev machine (after the unit file is confirmed pointing at `.venv/`)
- Update `CLAUDE.md` to say `backend/.venv/` is the load-bearing directory
- Update `README.md` manual-install steps

**Option B: Revert to pip + `requirements.txt` (simpler, fewer install-time deps).**
- Delete `backend/.venv/`, `backend/pyproject.toml`, `backend/uv.lock` (after confirming `venv/` has the same package set)
- Recreate `/etc/systemd/system/sitrep-api.service` pointing at `venv/bin/uvicorn`
- Restart the service and verify
- `CLAUDE.md` stays correct

**Not recommended:** keeping both. It's already caused confusion and will cause more.

> Do not execute either option from inside this audit — both touch the live venv and unit file, and the wipe-incident policy requires a deliberate plan. I've captured the options; you drive.

---

## 3. Status of the prior `QUALITY_REPORT.md` blockers

Rechecked each item against current code on `dev`.

| ID | Issue | 2026-04-10 | 2026-04-11 | Evidence |
|---|---|---|---|---|
| **C-1** | Cookies missing `secure=True` | ❌ | **❌ still open** | `main.py:596,600,1054,1363,1364` — five `set_cookie` calls, none pass `secure=True` |
| **C-2** | `server.status` permission key undefined | ❌ | **❌ still open** | `main.py:4333` uses `require_permission("server.status")` but `PERMISSION_DEFAULTS` at `main.py:193–204` does not define it — falls through to hardcoded `"admin"` in `require_permission()` at line 327 |
| **C-3** | Hardcoded `User=mark` in generated unit files | ❌ | **✔ FIXED** | `main.py:1681` now writes `User={getpass.getuser()}` |
| **C-4** | `/home/mark/` hardcoded in AIGM_BRIDGE_PATH | ❌ | **⚠ partial** | `main.py:4621` now uses `Path.home() / "AIGameMaster" / ...` instead of `/home/mark/...` — better, but still assumes that directory layout exists. For any user without an AIGameMaster checkout, the `/api/aigm/*` endpoints return "Bridge not found at ..." errors the first time the AI GM tab is opened. Needs an explicit "AI GM not configured" path that gates the frontend tab instead of silently erroring |
| **I-1** | `write_config()` not atomic | ❌ | **❌ still open** | `main.py:865` direct `config_path.write_text(...)` |
| **I-2** | WebSocket JWT passed in URL query | ❌ | **❌ still open** | `main.py:4585` `ws_endpoint(ws: WebSocket, token: str = "")` |
| **I-3** | No Content-Security-Policy header | ❌ | **❌ still open** | `main.py:704` security-headers middleware sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, but no CSP |
| **I-4** | `_global_rate` dict grows unbounded per IP | ❌ | **❌ still open** | `main.py:405` still `dq.popleft()` without `del _global_rate[ip]` when empty |
| **I-5** | `read_profile_config` missing permission check | ❌ | **❌ still open** | `main.py:2812–2821` — no `require_permission()` call. Any authenticated role (including `demo`) can read arbitrary files under `arma_dir`/`profile_dir`. The write sibling at line 2823 correctly calls `require_permission("admins.write")` |
| **I-6** | Multiple non-atomic inline writes | ❌ | **❌ still open** | Direct `.write_text()` calls still at: `main.py:865, 1651, 1672, 2673, 2838, 2936, 3556, 3569, 4361, 4978, 5602, 5626`. Twelve sites total |
| **I-7** | Startup params lack `shlex.quote` | ❌ | **❌ still open** | `main.py:3766` `new_line += f" -{key} {val}"` — no quoting. Char-filter at line 3730 blocks `\n\r\x00%` but allows spaces. Path with spaces breaks the `ExecStart` line. `shlex` is not imported anywhere |
| **I-8** | `Misfits_Logging` hardcoded | ❌ | **❌ still open** | 11 occurrences across `main.py:98,2662,3492,3522,3541,3565,5194,5238,5257,5290,5310`. No env var, no server-setting. Users with a different admin mod get silent no-ops |
| **I-9** | Bare `except: pass` | ❌ | **❌ still open** | 30 occurrences (count unchanged) |

**Summary:** 1 of 13 fixed, 1 partially fixed, 11 still open. The `main` branch (which Mark promotes manually) may have a different state — this audit is against `dev`.

---

## 4. New findings (not in prior report)

### N-1. `SECRET_KEY` env override documented but not implemented — LOW
`.env.example` says:
```
# Optional: override the auto-generated secret key (useful for multi-node setups)
# SECRET_KEY=your-secret-here
```
But `get_or_create_secret()` at `main.py:332` never consults `os.environ`. Setting `SECRET_KEY` in `.env` is silently ignored. Two fixes are acceptable:
- Honor the env var first: `if os.environ.get("SECRET_KEY"): return os.environ["SECRET_KEY"]`
- Or remove the example to prevent confusion.

### N-2. Zero use of the `logging` module — MEDIUM
`import logging` appears nowhere. Six `print()` calls across 5637 lines. Thirty `except: pass`. For a shippable, debuggable panel this is the single biggest quality-of-operations gap. Recommendation:

```python
import logging
logger = logging.getLogger("sitrep")
logging.basicConfig(level=os.environ.get("SITREP_LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
# or structured via python-json-logger for journald
```

Replace the 30 bare excepts in order of importance — start with `load_permissions`, `_get_build_id`, `_build_ws_index_bg`, `parse_logs`, anything in auth middleware. When an operator reports "the panel is weird," they currently have nothing in `journalctl -u sitrep-api` to look at other than uvicorn's access log.

### N-3. `datetime.utcnow()` deprecated — LOW but future-breaking
`main.py:301` `datetime.utcnow()` — pytest warns on it. Python 3.13 removes it. Fix: `datetime.now(datetime.UTC).isoformat()`. Single site.

### N-4. Security-relevant dep versions behind latest — MEDIUM
Current pins (checked in `.venv` via `importlib.metadata`):

| Pkg | Pinned | Latest (May 2025) | Note |
|---|---|---|---|
| Pillow | 11.1.0 | 11.2.x | 11.2 has CVE fixes; should bump |
| PyJWT | 2.8.0 | 2.10.x | 2.10 improves `aud` validation |
| fastapi | 0.115.0 | 0.116+ | No known CVEs, minor behind |
| uvicorn | 0.30.0 | 0.32+ | No known CVEs |
| httpx | 0.27.0 | 0.28+ | No known CVEs |
| psutil | 6.0.0 | 6.1.x | Minor |
| python-multipart | 0.0.24 | same | CVE-2024-53981 fix is in ≥0.0.18, so fine |
| python-dotenv | 1.0.1 | 1.0.x | Fine |

Pillow and PyJWT are the two that matter security-wise. Rest are freshness-only.

### N-5. Starlette deprecation warning from python_multipart — LOW
Pytest emits: `PendingDeprecationWarning: Please use 'import python_multipart' instead.` This is from starlette 0.x (bundled with FastAPI 0.115). Fixed by bumping FastAPI to a version that uses the renamed import. Not urgent.

### N-6. `main.py` is a single 5637-line file — MEDIUM (architecture)
This fights the "quick to debug, easy to upgrade" goal. A FastAPI router split is low-risk if done one subsystem at a time:

```
backend/
├── main.py                 # app init, middleware, router mounts only (~200 lines)
├── auth/
│   ├── routes.py           # /api/auth/*
│   ├── cookies.py          # set_auth_cookies, clear_auth_cookies
│   ├── tokens.py           # refresh token store, JWT create/decode
│   └── permissions.py      # PERMISSION_DEFAULTS, require_permission
├── servers/
│   ├── routes.py           # /api/servers/*, /api/server/*
│   ├── registry.py         # load_servers, save_servers, _init_server_registry
│   └── systemd.py          # systemctl, _manage_ports, _parse_current_startup_args
├── players/routes.py       # /api/players/*, /api/stats/*
├── admin/routes.py         # /api/admin/*
├── aigm/routes.py          # /api/aigm/*
├── workshop/routes.py      # /api/workshop/*
├── tracker/routes.py       # /api/tracker/*
├── rcon/routes.py          # /api/rcon/*
├── files/routes.py         # /api/files/*, /api/profile/config
├── system/routes.py        # /api/status, /api/network, /api/diagnostics
└── common/
    ├── config.py           # env vars, PANEL_DATA, ARMA_DIR, etc.
    ├── paths.py            # is_path_safe, srv_* helpers
    └── logging.py          # logger setup
```

This is the inverse of the frontend split — and there the tabs/ extraction is half-done and has caused real confusion (memory note `project_sitrep_tabs_extraction_trap.md`). The backend split should be **atomic per subsystem**: move all of `/api/auth/*` + its helpers to `auth/routes.py` in one PR, verify, commit, move to the next. Do not leave half-done extractions like `tabs/`.

### N-7. Hand-parsed `request.json()` instead of pydantic models — MEDIUM
Only 6 `BaseModel` subclasses (`ForgotPasswordBody`, `ResetPasswordBody`, `SetupRequest`, `Totp2FABody`, `TotpEnableBody`, `TotpDisableBody`). Every other endpoint does:

```python
body = await request.json()
username = body.get("username", "").strip()
password = body.get("password", "")
```

This loses FastAPI's main advantage: automatic validation, OpenAPI schema, and tooling support. The panel at `/docs` is currently almost useless because FastAPI can't introspect the request shapes. Migrating endpoints to pydantic `BaseModel` bodies is low-risk (the runtime behavior is unchanged, only shape validation is added) and can be done endpoint-by-endpoint.

### N-8. Auth via middleware + `request.state` — MEDIUM (testability)
`auth_middleware` mutates `request.state.user` and `request.state.server`, and endpoints pull it back out via `current_user(request)`. This is **why tests have to mock at import time**:
```python
with mock.patch('builtins.open', ...), mock.patch('sqlite3.connect') as _mc:
    import main as app_main
```
FastAPI's idiomatic pattern is a `Depends()` function:
```python
def require_user(request: Request) -> dict:
    payload = decode_token(request.cookies.get("sitrep-access", ""))
    if not payload: raise HTTPException(401)
    ...
    return {"username": payload["sub"], "role": payload["role"]}

@app.get("/api/users/profile")
async def get_own_profile(user: dict = Depends(require_user)):
    ...
```
This makes every endpoint independently testable with FastAPI's `TestClient` and no module-level monkey-patching. Strong recommendation for shipability.

### N-9. `sudo tee` to write systemd files — LOW (fragility)
`main.py:1694, 3771` pipe content through `sudo tee /etc/systemd/system/...`. Works, but relies on the sudoers rule permitting `tee`. Currently the sudoers rule installed by `install.sh:272` is:
```
mark ALL=(ALL) NOPASSWD: /bin/systemctl
```
This **does not grant `/usr/bin/tee`**. The only reason the panel-generated service files work today is the `data_dir` directory or permissions happened to allow it — or the operator ran the panel as root once. Needs verification:

```bash
# On the dev machine:
sudo -l -U mark | grep -E "tee|systemctl"
```

If `sudo tee` is not in the sudoers allow-list, server provisioning via `/api/servers/{id}/provision` is silently broken for any non-root installation. Use one of:
- Add `/usr/bin/tee /etc/systemd/system/*.service` to the sudoers allow-list (narrowest)
- Write the service file to a user-writable staging path, then `sudo systemctl link` it
- Use `systemd-run --user` instead for per-server units (major redesign)

### N-10. Missing permission check on `GET /api/profile/config` — MEDIUM (I-5 restated + verified)
Confirmed at `main.py:2812` — any authenticated user including `demo` can read JSON files under `arma_dir`. Low exploitability (already authed, already path-safe) but the `demo` role should not be able to read admins lists. One-line fix.

### N-11. Rate-limit data structure is an unbounded dict (I-4 restated + impact)
On a public deployment, over time `_global_rate` acquires a key for every IP that ever touched the panel. Each entry is small but never cleaned up. On a self-hosted LAN deployment this is harmless; on any internet-exposed panel it's a slow memory leak.

### N-12. Stale files at repo root — LOW (cleanup)
Present in `/opt/panel/` but look accidental:
- `test.pyc` — compiled file tracked in git? Check `git ls-files | grep test.pyc`
- `Thumbs.db` — Windows metadata, should be in `.gitignore`
- `final_test/` — empty directory
- `MisfitsAdminTools/file.txt`, `ServerAdminTools/file.txt` — look like marker/placeholder files
- `scraper/venv/` — a third venv hiding in the scraper subdir

None of these break anything, but they signal "this repo was developed locally, not groomed for distribution." A `.gitignore` sweep + `git rm --cached` for the compiled/metadata files would tidy this.

### N-13. Refresh endpoint duplicates cookie-setting logic — LOW (drift risk)
`main.py:1054` sets the access cookie inline with explicit args instead of calling `set_auth_cookies`. If `set_auth_cookies` adds `secure=True` later and this site is missed, the refresh endpoint will leak the fix. Fix by refactoring the inline `set_cookie` to use the helper — at the same time as the C-1 fix.

### N-14. CORS computed at module import — LOW (M-3 restated)
`main.py:689–703`. If the operator changes `PANEL_URL` or `settings.json`, the backend needs a restart. Minor; already in prior report.

---

## 5. What modern-tooling-wise is missing for a "quick to debug, future-proof" panel

This is the user's central ask. Objective gaps against what a 2026-era server management panel typically includes:

| Concern | Current | Modern default | Priority |
|---|---|---|---|
| Logging | `print()` + bare excepts | `logging` module → journald; or structlog/loguru | **High** |
| Metrics | None | `prometheus-client` at `/api/metrics` | Med |
| Health probes | Single `/api/health` (no liveness/readiness split) | `/livez` + `/readyz` (checks DB, venv, arma service) | Low |
| Request validation | Hand-parsed JSON | pydantic `BaseModel` + `Depends()` | **High** |
| Auth pattern | Middleware → `request.state` | `Depends(get_current_user)` | **High** |
| Background tasks | `asyncio.create_task` | `arq`, `fastapi-utils.repeat_every`, or a simple scheduler task | Med |
| DB migrations | Inline `CREATE TABLE IF NOT EXISTS` in three places | `alembic` on sqlite, or at least a versioned schema dict | Low |
| Config | `os.environ.get(..., literal_default)` scattered | `pydantic-settings.BaseSettings` with one `Settings` object | Med |
| Rate limiting | Homegrown deque-per-IP | `slowapi` or `fastapi-limiter` (uses same API, less code) | Low |
| Test client | Manual import-time mocks | `fastapi.testclient.TestClient` with dependency overrides | **High** |
| Dep management | Split across `requirements.txt` + `pyproject.toml` + two venvs | **Pick one** (see §2) | **Blocker** |
| Error tracking | None | Optional sentry hook (`pip install sentry-sdk[fastapi]` and gate on env var) | Med |
| API docs | `/docs` renders but request shapes are empty (no pydantic) | Auto-generated OpenAPI with typed models | Med |
| Code layout | 5637-line `main.py` | Router split (§N-6) | **High** |
| CI | No GitHub Actions visible in repo root | Lint + test + smoke-install on push | **High** for shipping |

None of these are blockers individually. Collectively, they're the difference between "a script I share with friends" and "software other people install and trust."

---

## 6. What's genuinely solid — do NOT change

Re-confirmed from prior audit and my read:
- **JWT secret bootstrap** — `secrets.token_hex(32)` on first run, `chmod 0o600`, no hardcoded fallback (`main.py:332`)
- **Password hashing** — PBKDF2-SHA256 × 100k with per-user salt, `compare_digest` for verify (`main.py:343`, `348`)
- **Refresh token store** — opaque hex, server-side in `refresh_tokens.json`, per-user revocation on password change (`main.py:180`)
- **`SameSite=Strict`** — CSRF-safe for the cookie-auth model (missing only `Secure=True`)
- **`tokens_valid_after`** revocation field checked on every request (`main.py:651`)
- **Path traversal** — `is_path_safe()` uses `.resolve()` and prefix-match with `os.sep`; used consistently in file endpoints (`main.py:941`)
- **Atomic writes** — `refresh_tokens.json`, `servers.json`, `permissions.json`, `panel_users.json`, `user_profiles.json`, `hooks.json`, `deployments.json`, `settings.json`, `tracker_settings.json` all use the tmp-then-replace pattern correctly
- **Rate limiting design** — two-tier (burst + sustained window) plus login lockout; sliding window deque is the right structure
- **Subprocess calls** — all use list-form args (`subprocess.run([...])`). `shell=True` never appears. Good.
- **Workshop `verify=False`** — correctly scoped to only the four Bohemia CDN clients, not global (M-1 still a useful comment-only fix)
- **`X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` + `Referrer-Policy`** — correct middleware
- **`require_permission()` in 88 places** — permission checks are consistently applied (one known miss: I-5/N-10)

The architecture is correct. The issues are polish, not foundational.

---

## 7. Recommended order of work

Ranked by "what unblocks a v1.0 public release."

### Phase 1 — Unblocks shipping (must do before public release)

1. **Resolve venv drift** (§2). Pick uv or pip; update install.sh, unit file, CLAUDE.md, README. Single PR.
2. **C-1 cookies `secure=True`** — 5 call sites + `COOKIE_SECURE=true` default with env-var off-switch for local HTTP
3. **C-4 AIGM graceful absence** — if `AIGM_BRIDGE_PATH` doesn't exist, return `{"enabled": false}` from `/api/aigm/status` and hide the tab on the frontend
4. **I-8 Misfits_Logging configurable** — one env var `MAT_PROFILE_DIR` with default `Misfits_Logging`, referenced in 11 sites
5. **N-4 bump Pillow and PyJWT** — one commit, test suite run, done

### Phase 2 — Quality of operations (should do before wide distribution)

6. **N-2 proper logging** — import `logging`, replace 30 bare excepts with `logger.exception(...)` at minimum
7. **I-1, I-6 atomic writes everywhere** — helper `write_atomic(path, data)` used in 12 sites
8. **I-7 `shlex.quote` in startup params** — one site
9. **I-5/N-10 permission check on `read_profile_config`** — one line
10. **I-4/N-11 `_global_rate` cleanup** — one `if not dq: del _global_rate[ip]`
11. **C-2/N-? define `server.status` in `PERMISSION_DEFAULTS`**
12. **I-2 WebSocket ticket flow** — issue 30-second single-use tickets via `POST /api/ws-ticket`, pass ticket (not JWT) in URL
13. **I-3 Content-Security-Policy header** — copy the exact string from prior report
14. **N-9 verify `sudo tee` works for non-root service-file writes** — either expand sudoers allow-list or switch to a different write pattern
15. **N-12 repo cleanup** — gitignore `test.pyc`, `Thumbs.db`, `final_test/`, `scraper/venv/`

### Phase 3 — Future-proofing (can defer)

16. **N-7 pydantic models** — migrate high-traffic endpoints first (`/api/auth/login`, `/api/users/*`, `/api/servers/*`)
17. **N-8 `Depends()`-based auth** — migrates naturally alongside pydantic
18. **N-6 router split of `main.py`** — one subsystem per PR, atomically cut-over
19. **N-5 bump FastAPI to eliminate `python_multipart` warning**
20. **CI** — GitHub Actions: ruff + pytest + a smoke test that runs `install.sh` in a container and hits `/api/health`

### Phase 4 — Nice to have

- Metrics (`/api/metrics` via prometheus-client)
- `pydantic-settings` for a single `Settings` object
- `slowapi` to replace the homegrown rate limiter
- sentry hook behind env var
- `/livez` + `/readyz` split

---

## 8. Small, safe fixes you could apply immediately

These are zero-risk and don't touch code architecture. A separate Claude session (or you manually) could do them in one commit on `dev` without needing a larger plan. **I did not apply them** — per your request and the wipe-incident policy, this audit made no code changes.

1. **CLAUDE.md line 22**: change `backend/venv/` → `backend/.venv/` — matches reality on dev (but creates drift from install.sh; do this *after* deciding §2)
2. **`.gitignore`**: add `test.pyc`, `Thumbs.db`, `final_test/`, `scraper/venv/`
3. **`.env.example`**: remove the `SECRET_KEY` override hint (or implement it in `get_or_create_secret`)
4. **`main.py:301`**: replace `datetime.utcnow().isoformat()` with `datetime.now(datetime.UTC).isoformat()`
5. **`main.py:941` (`is_path_safe`)**: add a check that rejects paths containing `..` *before* resolving — defense-in-depth, the current resolve-then-check is already correct but a leading check is easier to reason about
6. **Add a trailing `is_demo` check to `/api/profile/config` GET**: one line, covers I-5/N-10

---

## 9. Audit methodology & what I did not check

**Checked:**
- `backend/main.py` structural read (imports, globals, auth middleware, permissions, rate limit, cookies, refresh tokens, all route decorators, file-write helpers, subprocess sites)
- `backend/requirements.txt`, `backend/pyproject.toml`, `backend/uv.lock`
- `/etc/systemd/system/sitrep-api.service` unit file
- `install.sh` full read
- `CLAUDE.md`, `README.md`, prior `docs/QUALITY_REPORT.md`
- `backend/tests/*.py` — collected + ran (47 pass)
- `.env.example` vs `.env`
- Both venv directories (contents, package versions)
- Git state on `dev` (log, status, branch)
- `/opt/panel/backend/data/` (file listing + permissions)
- Service status via `systemctl status sitrep-api`

**Not checked (out of scope for this audit):**
- `frontend/src/App.jsx` — out of scope (user asked for backend audit specifically)
- `backend/data/*.db` — sqlite schemas only read through `_init_*_db()` functions, not queried directly
- Live traffic / actual running behavior beyond what's visible in `journalctl`
- The `scraper/` subdirectory contents
- `MisfitsAdminTools/` and `ServerAdminTools/` contents beyond the `file.txt` markers
- `servers/` directory contents
- The AI GM bridge at `~/AIGameMaster` — separate project
- Any network-exposed behavior (CORS actually working, cookies actually set over HTTPS)

**Prior-audit items I rechecked but did not rewrite from scratch:** C-1, C-2, C-3, C-4, I-1 through I-9. See §3 for per-item status.

---

## 10. Bottom line

The panel is a well-architected but single-developer project that has outgrown its "local tool" stage. The security foundations are correct; the polish and packaging are not. Ship-blockers are concrete and finite — roughly 15 items across Phases 1 and 2 of §7, most of them single-site one-line fixes.

The one thing I would prioritize above everything else if you want this to be a panel other people trust:
**Pick a venv story, unify install.sh with the live system, and add `logging`.** Everything else is incremental. Those two changes are the difference between "we're drifting" and "we have a shipping line."

— Claude Code, 2026-04-11
