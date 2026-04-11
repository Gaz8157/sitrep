# Pre-Promote Cleanup Session (2026-04-11)

Prep pass on the `dev` branch so a code-review agent can audit the panel end-to-end
before Mark promotes to `main`. Read top-down.

## Where everything lives

- **Repo:** `/opt/panel` (branch `dev`)
- **Backend:** `/opt/panel/backend/main.py` (5642 lines, FastAPI + SteamCMD + systemd)
- **Frontend:** `/opt/panel/frontend/src/` (React 19 + Vite, 22 files, 6534 total lines)
- **Tests:** `/opt/panel/backend/tests/test_{auth,ports,profile,stats}.py`
- **Service:** `sitrep-api.service` (uvicorn on `0.0.0.0:8000`, serves `/opt/panel/frontend/dist`)

## Commit ledger for this session (oldest → newest)

| Commit    | What |
|-----------|------|
| `3cebf3a` | `fix(serverpicker): remove deleted server from list immediately` |
| `fa58aa6` | `feat(provision): default new servers to 23_Campaign scenario instead of blank` |
| `6aa8f20` | `chore(gitignore): exclude backups, scraper workspace, servers instance dirs, quality audit` |
| `a91d2c2` | `docs: add public install guide and frontend split session writeup` |
| `9077be1` | `fix(auth): enforce 8-char minimum on password change + refresh stale port/avatar tests` |
| `b016df6` | `fix(tracker): density selector now actually changes density` |

Plus the prior-in-session commits that also belong in this merge:

| Commit    | What |
|-----------|------|
| `9c43527` | `feat(dashboard): surface SteamCMD output + live elapsed in reset progress` |
| `45c1633` | `feat(dashboard): rework reset modal — clear mods/logs/update with live step progress` |
| `c99d326` | `refactor: App.jsx routing-shell rewrite (Task 8 — final split)` |

`dev` is 25 commits ahead of `main`, 0 behind.

## Concrete fixes landed

### 1. Dashboard reset button did nothing

**Symptom:** User hit the reset button and nothing happened.

**Root cause:** Two things. (a) The only action options were "Wipe Saves" / "Clear
Logs" / "Update via SteamCMD" — the user actually wanted "Clear Mods" (delete
profile_dir/addons). (b) The flow fired toasts that disappeared instantly, leaving
no visible feedback during the multi-minute SteamCMD run.

**Fix:**
- `backend/main.py:2287` — new `clear_mods` action in `/api/server/reset`: walks
  `profile_dir/addons`, sums freed MB, returns `{message: "Cleared N addon(s), X MB freed"}`
- `backend/main.py:2597` — bumped SteamCMD stdout/stderr capture from 500 → 2000 chars
  so the "Success! App '1874900' already up to date." tail survives
- `frontend/src/tabs/Dashboard.jsx` — modal rewrite:
  - Three options: Clear Mods / Clear Logs / Update via SteamCMD (update default on)
  - Multi-step progress view replaces the checkbox list once running
  - Each step shows `○ pending → ● running (pulse) → ✓ done / ✗ error`
  - Live elapsed seconds ticker while running (1Hz), final duration on completion
  - SteamCMD `stdout` tail rendered in a monospace console block under the step
  - Modal can't be closed while a step is running
  - Close button clears step list on completion so the next run starts fresh

### 2. `/api/server/update` looked like a no-op

**Symptom:** Selecting Update in reset made the server restart with zero visible
evidence that SteamCMD ran.

**Root cause:** SteamCMD returned success in ~14 seconds because the server files
were already current. The step row showed "Update complete" with no stdout, which
was indistinguishable from a no-op.

**Fix:** Same as above — surfacing the `output` field and duration makes the
"already up to date" case visibly different from a true no-op. Real downloads
will now stream their progress tail into the step row.

### 3. ServerPicker delete didn't clear the deleted card

**Symptom:** Deleting a server in the picker required a page refresh to make the
card disappear.

**Root cause:** `deleteServer` called `fetchServers()` after the DELETE, but the
UI was stale. Diagnosis ambiguous — likely a state-closure race or the interval
re-fetch colliding with the manual one — but the correct UX pattern for delete
is optimistic local state update anyway.

**Fix:** `frontend/src/tabs/ServerPicker.jsx:186` — optimistically drop the row
from local `servers` state the moment the DELETE is sent; restore it on backend
error. Still fires `fetchServers()` as a reconcile pass.

### 4. New servers couldn't launch out of the box

**Symptom:** Freshly provisioned servers had `scenarioId: ""` which made them
fail to start.

**Fix:** `backend/main.py:1661` — `provision_server` now defaults
`scenarioId = "{ECC61978EDCC2B5A}Missions/23_Campaign.conf"` (stock 23 Campaign).
Users can still change it, but the default boots.

### 5. Tracker density selector was inert

**Symptom:** Clicking the S/M/L density buttons in the Tracker tab did nothing —
no layout change, no persistence.

**Root cause:** `persistDensity` was infinite-recursive:
```js
const persistDensity = (d) => { persistDensity(d); try { localStorage.setItem('tracker-density', d) } catch {} }
```
It called itself instead of `setDensity`. Stack overflow thrown inside a React
event handler was silently eaten. Classic copy-paste bug from the other
`persist*` helpers.

**Fix:** `frontend/src/tabs/Tracker.jsx:742` — `persistDensity(d)` → `setDensity(d)`.

### 6. Password change had no minimum length

**Symptom:** Caught by `test_change_password_too_short` which expected 400 on
`"short"` (5 chars) but got 200.

**Fix:** `backend/main.py:4099` — added `len(new_pw) < 8` check returning
`{"error": "New password must be at least 8 characters"}` with 400. Real
security gap, not just a test setup issue.

## Test suite state

Before this session:
```
7 failed, 40 passed
```
- 5× `test_ports.py` — stale expectations (port scheme changed from `bindPort+1` to Arma Reforger defaults)
- 1× `test_profile.py::test_upload_avatar_too_large` — stale 2MB expectation vs 10MB backend limit
- 1× `test_profile.py::test_change_password_too_short` — real security gap

After:
```
47 passed, 0 failing, 2 warnings (pre-existing deprecation noise)
```

The real fix was the password-min-length check in `backend/main.py`. The five
port tests and the avatar test were stale and got refreshed to match the
current backend. `_server_ports()` at `backend/main.py:2330` is the source of
truth: `[(bindPort, 'udp'), (bindPort + 15776, 'udp'), (rcon_port, 'tcp')]`
with rcon_port defaulting to 19999.

To re-run locally:
```bash
cd /opt/panel && backend/.venv/bin/python -m pytest backend/tests/ -q
```

pytest + pytest-asyncio were installed via
`uv pip install --python .venv/bin/python pytest pytest-asyncio` — they were
not in the venv before. If the reviewer wants them in `pyproject.toml` as a
`dev` extra, that's a separate cleanup.

## Frontend split verification

`App.jsx` is 294 lines (routing shell) — down from 5380. The split landed
across `frontend/src/tabs/*.jsx` (16 files) plus shared infra
(`api.js`, `ctx.jsx`, `hooks.js`, `constants.js`, `components/ui.jsx`).

Two independent verifications performed this session:

**Per-file esbuild syntax check** — every `.jsx`/`.js` in `src/` parses clean
in isolation:
```bash
cd /opt/panel/frontend && for f in src/tabs/*.jsx src/components/ui.jsx \
  src/api.js src/constants.js src/ctx.jsx src/hooks.js src/App.jsx; do
  npx esbuild --loader:.jsx=jsx --bundle=false "$f" > /dev/null && echo "ok  $f"
done
```
All 22 files: `ok`.

**Cross-file import resolution** — scripted walk across every file, every
relative import is resolved against the actual target file's export list.
All 99 local import arcs resolve to real exported symbols. No orphaned imports,
no references to a symbol that doesn't exist at source.

**Full build:**
```bash
cd /opt/panel/frontend && npm run build
# ✓ built in 167ms
```

**Line count breakdown:**
```
App.jsx          294   routing shell
tabs/AiGm.jsx   1450   largest single tab
tabs/Tracker.jsx 1032   entirely new feature, not from the split
tabs/Profile.jsx 853
tabs/Admin.jsx   490
tabs/Mods.jsx    444
tabs/ServerPicker 337
tabs/Startup.jsx 331
tabs/Files.jsx   247
tabs/Permissions 241
tabs/Auth.jsx    195
tabs/Dashboard   137
tabs/Console.jsx 102
tabs/Config.jsx   87
tabs/Network.jsx  35
tabs/Scheduler    16
tabs/Webhooks.jsx  9
shared infra    234   api.js + ctx.jsx + hooks.js + constants.js + ui.jsx
                 ────
total:          6534
```
Total is ~1150 lines larger than the original 5380-line monolith. Subtracting
the entirely new Tracker tab (1032, not a migration) leaves ~5502 lines for
functionally equivalent code — basically byte-identical bodies plus one import
header per file. Matches the mechanical extraction discipline in the plan at
`docs/superpowers/plans/2026-04-10-frontend-split.md`.

## .gitignore cleanup

Working tree before this session had ~10 untracked paths. After cleanup:
```
nothing to commit, working tree clean
```

**Added to .gitignore:**
- `backups/` — session snapshot tarballs (3.6M growing)
- `scraper/` — local workspace (167M venv, no source files currently)
- `servers/` (replaces `servers/*/data/` and `servers/*/profile/`) — the whole
  instance tree is per-deployment state; no files inside were ever tracked
- `docs/QUALITY_REPORT.md` — pre-release security audit enumerating live
  vulnerabilities. Kept out of the public repo on purpose.

**Committed (not ignored):**
- `docs/INSTALL.md` — public install guide
- `docs/session-2026-04-10-frontend-split-progress.md` — companion to the
  already-tracked `session-2026-04-10-tracker-polish.md`

## Things NOT changed this session

- **No push to `main`** — per durable rule, Mark promotes manually.
- **No pytest in pyproject.toml** — installed ad-hoc in the venv so the suite
  could run; if the reviewer wants a `[dev-dependencies]` block, that's a
  follow-up.
- **Deprecation warnings** — `datetime.utcnow()` at `main.py:301` and
  starlette's `python_multipart` warning. Both pre-existing, both non-blocking.
  Not in scope for a pre-promote pass.
- **Other sessions' docs** — `docs/QUALITY_REPORT.md` stays gitignored because
  it contains live vulnerability findings and shouldn't hit a public repo.
- **Mod source** — no changes to `/home/mark/PlayerTracker/` this session.

## Runtime state at end of session

- `systemctl is-active sitrep-api` → `active`
- `git status` → clean
- `git log --oneline main..dev | wc -l` → 25
- Frontend build → `✓ built in 167ms`
- Backend syntax → `main.py` parses via `ast.parse`
- Test suite → `47 passed, 0 failing`

## For the reviewing agent

The live panel is running on this host. If the reviewer needs to observe it:

- Backend: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/api/status` → 401
  (unauthenticated — expected). `systemctl is-active sitrep-api` confirms the process.
- Frontend: the built dist is served by the same uvicorn on `:8000`. No separate nginx.
- Logs: `journalctl -u sitrep-api --since "10 minutes ago"`.
- `.env`: gitignored, never tracked. Contains `PLAYERTRACKER_API_KEY` and nothing else sensitive.

**Audit priorities** (in rough descending order of what I'd want a second pair
of eyes on):

1. The `c99d326` routing-shell rewrite of `App.jsx` — largest single change
   since the split started. I verified imports resolve and the build succeeds,
   but a human browser walkthrough of every tab is still the gold standard.
2. `backend/main.py` permission/auth layer — `require_permission`, `current_user`,
   `_tracker_check_key`. The tracker auth bypass for localhost (`::1`, `127.0.0.1`)
   is intentional but is worth re-confirming against the threat model.
3. `backend/main.py:2287` new `clear_mods` action — destructive, owner-scoped,
   but worth a second read to make sure there's no path-escape angle.
4. `frontend/src/tabs/Dashboard.jsx` reset step progress — step-tracking logic
   is dense.
5. `docs/QUALITY_REPORT.md` (not in repo, but at `/opt/panel/docs/QUALITY_REPORT.md`
   on disk) — documents C-1 secure cookie and other blockers flagged on 2026-04-10.
   A reviewer should check which of those are still open.

## Durable rules observed this session

1. **`dev` branch only** — never touched `main`, never pushed.
2. **Mark promotes manually** — I did not push anything.
3. **Stage only your own files** — the uncommitted parallel-session `scenarioId`
   edit was committed at Mark's explicit request, not auto-bundled.
4. **No chatty comments** — none added to any extracted file.
5. **Mechanical extraction discipline** (historical) — the split commits came
   from prior sessions; this session only verified, didn't re-extract.
