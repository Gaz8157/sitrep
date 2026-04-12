# Ship-Prep Session (2026-04-11)

Continuation of the pre-promote cleanup session. Focus: close the ship blockers
from `docs/BACKEND_AUDIT_2026-04-11.md` Phase 1 and unstick a handful of bugs
Mark hit while trying to use the panel end-to-end over his domain. Goal was to
get `/opt/panel` to a state where a fresh user can `curl | sudo bash` the
installer and it Just Works.

## Where everything lives

- **Repo:** `/opt/panel` (branch `dev`)
- **Backend:** `/opt/panel/backend/main.py` (FastAPI, single file)
- **Frontend:** `/opt/panel/frontend/src/` (React 19 + Vite, split across `tabs/*.jsx`)
- **Service:** `sitrep-api.service` (uvicorn on `0.0.0.0:8000`)
- **Live venv:** `/opt/panel/backend/.venv/` (uv-managed from `backend/pyproject.toml` + `backend/uv.lock`)

## Commit ledger for this session (oldest → newest)

| Commit    | What |
|-----------|------|
| `220d49a` | `fix(backend): merge parallel session work — audit phase 1 + PANEL_DATA scoping` |
| `19a56f2` | `feat(panel): SMTP provider-first UI, AIGM tab gate, dep bumps` |
| *uncommitted* | back-to-login bug fix + installer rewrite to uv + docs sync + Tracker tab visibility fix + personal-data scrub + `hostname -I` empty-string fix |

`dev` is 27 commits ahead of `main` (before the pending commit).

## Audit items closed (from BACKEND_AUDIT_2026-04-11.md Phase 1)

| ID  | Title | Status |
|-----|-------|--------|
| C-1 | Cookie `secure=True` under HTTPS | ✅ |
| C-4 | AIGM graceful absence (no bridge script) | ✅ |
| I-8 | `Misfits_Logging` hardcoded profile dir | ✅ |
| N-4 | Pillow / PyJWT CVE version bumps | ✅ |
| §2  | `venv/` vs `.venv/` drift | ✅ |

Phase 2/3/4 items (atomic writes, structured logging, shlex.quote, WS ticket
flow, CSP header, etc.) remain deferred.

## Concrete fixes landed

### 1. Password reset "succeeded" but login failed

**Symptom:** Mark reset his password via the Settings → Security flow, the
endpoint returned success, but logging in with the new password said "password
incorrect".

**Root cause:** `reset_password_endpoint` was writing the new password as a pure
hex string into `password_hash` **plus** a sibling `salt` field — but
`verify_password` expects `hash_password`'s format of `"salt_hex:hash_hex"` and
splits on `:`. Split on pure hex returns one element, the unpack raised
`ValueError`, and the `except` returned `False`. Every login after a reset was
silently rejected.

**Fix:** `backend/main.py:1230` — `reset_password_endpoint` now calls
`hash_password(body.password)` directly (same path as login-password-change),
pops any stale `salt` field from the user dict, and enforces the 8-char minimum
that the rest of the panel uses. Committed in `220d49a`.

### 2. Discord OAuth "Not a well formed URL"

**Symptom:** Clicking "Sign in with Discord" returned
`{"redirect_uri": ["Not a well formed URL."]}` from the Discord authorize
endpoint.

**Root cause:** `settings.json` had a relative `discord_redirect_uri` of
`/api/auth/discord/callback` — a leftover from an earlier setup wizard path.
Discord's OAuth spec requires an absolute URL.

**Fix:** two layers.

- **Defensive helper** — `backend/main.py:1377`:

    ```python
    def _discord_redirect_uri(settings: dict) -> str:
        raw = (settings.get("discord_redirect_uri") or "").strip()
        if raw and raw.startswith(("http://", "https://")) and "localhost" not in raw:
            return raw
        base = (os.environ.get("PANEL_URL") or "").rstrip("/")
        return f"{base}/api/auth/discord/callback" if base else ""
    ```

  Rejects non-absolute or localhost URLs and falls back to deriving from
  `PANEL_URL`. A companion `_discord_frontend_base` at line 1394 does the same
  for the post-login redirect target. All four Discord endpoints
  (`/api/auth/discord`, `/api/auth/discord/callback`, and the two admin-linking
  sites) route through the helpers, so there is one source of truth.

- **Data cleanup** — cleared `discord_redirect_uri` and `frontend_url` in
  `/opt/panel/backend/data/settings.json` so the helper takes the
  `PANEL_URL`-derived path. (Per-instance only — `settings.json` is gitignored.)

Committed in `220d49a`.

### 3. Panel advertised as `http://<LAN-IP>:8000` under the HTTPS domain

**Symptom:** Mark had an HTTPS domain pointing at his box via a Cloudflare
tunnel, but the login page showed his LAN IP with a "Not Secure" badge, and the
"shield badge" he used to see in his browser was gone.

**Root cause:** `/opt/panel/.env` still had
`PANEL_URL=http://<LAN-IP>:8000` from first install. The backend auth
cookie's `Secure` flag is keyed off `PANEL_URL.startswith("https://")`, and
every URL the frontend builds uses the `PANEL_URL`-derived API base, so an
http-scheme value cascaded everywhere.

**Fix:** flipped `/opt/panel/.env` to `PANEL_URL=https://<his-domain>`,
preserved `PLAYERTRACKER_API_KEY`. Cookies now go out with `Secure` + `HttpOnly`
+ `SameSite=Lax`, API calls resolve to the HTTPS domain, the browser lock icon
is back. (Per-instance only — `.env` is gitignored.)

### 4. Cookies weren't `Secure` by default (audit C-1)

**Symptom:** The access cookie was set with `secure=False` regardless of
whether the panel was served over HTTPS. Audit flagged as a credential-theft
risk for anyone deploying over a public domain.

**Fix:** `backend/main.py` — introduced a module-level
`COOKIE_SECURE = bool(os.environ.get("PANEL_URL","").startswith("https://"))`
and a `set_access_cookie(response, token, remember)` helper. Every cookie site
in the backend (login, 2FA verify, refresh, Discord callback, setup wizard)
now goes through the helper, so there is exactly one spot to change if the
rule needs to be updated.

Default behaviour: on HTTP (localhost dev, LAN install) the cookie is
`Secure=False` so the browser will send it; on HTTPS it's `Secure=True` so the
browser will only send it over TLS. No env flag required — it derives from
what PANEL_URL says.

Committed in `220d49a`.

### 5. AIGM tab was always visible even without the bridge (audit C-4)

**Symptom:** Fresh installs without `AIGameMaster` on disk still showed the
AI GM tab. Clicking it hit a dead backend endpoint and logged a traceback.

**Fix:** three touches.

- `backend/main.py` — `AIGM_BRIDGE_PATH` constant moved above the
  `/api/aigm/status` handler so every consumer sees the same value. Status
  endpoint returns `{"available": False}` when the file is missing instead of
  500-ing.
- `backend/main.py` — `/api/settings/public` now returns
  `{"discord_client_id": ..., "aigm_enabled": AIGM_BRIDGE_PATH.exists()}` so
  the frontend knows up front.
- `frontend/src/App.jsx:146-155` — new `aigmEnabled` state, fetched on mount
  from `/api/settings/public`; `visibleTabs` filter at line 167 excludes the
  `aigm` entry when `aigmEnabled` is false.

Net effect: ship-ready panel with no AIGM install hides the tab entirely, and
if the user later clones `AIGameMaster` next to the panel the tab appears on
the next reload. Committed in `220d49a` + `19a56f2`.

### 6. `Misfits_Logging` hardcoded profile dir (audit I-8)

**Symptom:** Eleven places in `main.py` literally hardcoded `"Misfits_Logging"`
as the Arma profile dir under `profile/profiles/`. That's the name of Mark's
specific MAT deployment — anyone else using a different profile name would
silently get zero tracker data.

**Fix:** `backend/main.py` — single module-level constant
`MAT_PROFILE_DIR_NAME = os.environ.get("MAT_PROFILE_DIR", "Misfits_Logging")`,
all eleven call sites updated. `docs/INSTALL.md` documents the env var as
optional. Committed in `220d49a`.

### 7. SMTP config was Gmail-shaped and scary

**Symptom:** The Permissions → Email Settings panel was a flat list of `smtp_host` / `smtp_port` / `smtp_user` / `smtp_pass` fields with Mark's Gmail app password pre-filled. Shippable to a GitHub stranger? No.

**Fix:** `frontend/src/tabs/Permissions.jsx` — rewritten with a provider-first
flow:

1. Module-level `SMTP_PROVIDERS` constant with entries for Gmail, SendGrid,
   Mailgun, Resend, Postmark, Fastmail, and Custom. Each has host, port, TLS
   default, `userPlaceholder`, `passPlaceholder`, and a `setupSteps` array.
2. `detectProvider(host, port)` — reverse-lookup so an existing Gmail config
   picks the Gmail entry when the tab reopens, not "Custom".
3. `pickSmtpProvider()` — when the user picks a provider from a dropdown, we
   fill `smtp_host`/`smtp_port`/`smtp_use_tls` from the preset but leave
   `smtp_user`/`smtp_pass` alone (avoids clobbering existing credentials).
4. Setup-steps accordion under the dropdown with provider-specific "go here,
   click this, generate app password" instructions. Gmail links directly to
   the app-passwords page.
5. `saveSmtp()` + `testSmtp()` helpers stayed — the backend contract is
   unchanged.

`backend/main.py` — `_get_smtp_config` now calls `load_settings(PANEL_DATA)`
instead of directly reading `/opt/panel/backend/data/settings.json`, which
plays nicely with the PANEL_DATA scoping the sibling session introduced.
Committed in `19a56f2`.

### 8. Dep bumps (audit N-4)

`backend/pyproject.toml` + `backend/requirements.txt`:

- `Pillow` 11.1.0 → 11.3.0 (CVE-2025-48379 and friends)
- `PyJWT` 2.8.0 → 2.12.1 (no known CVE, just stale)

`uv.lock` regenerated. Committed in `19a56f2`.

### 9. "Back to Login" button did nothing after password reset

**Symptom:** User clicks the reset link in the email, lands on
`/?reset_token=...`, enters new password, sees "Password updated", clicks
"Back to Login"… and nothing happens. URL bar updates but the component stays
on the reset view.

**Root cause:** `frontend/src/App.jsx:91` was:

    const resetToken = new URLSearchParams(window.location.search).get('reset_token')
    if (resetToken) return <ResetPassword token={resetToken} onDone={() => {
      window.history.replaceState({}, '', window.location.pathname)
    }}/>

`window.history.replaceState` updates the address bar but does **not** trigger
a React re-render. `resetToken` was re-computed on every render, but since
nothing in App's state or props had changed, App didn't re-render. The
component stayed mounted with the old token, the URL quietly desynced from
the UI.

**Fix:** `frontend/src/App.jsx` — lifted `resetToken` into React state so
`setResetToken(null)` forces a re-render into the Login view.

```diff
   const [selectedServer, setSelectedServer] = useState(null)
+  const [resetToken, setResetToken] = useState(() =>
+    new URLSearchParams(window.location.search).get('reset_token')
+  )
…
-  const resetToken = new URLSearchParams(window.location.search).get('reset_token')
-  if (resetToken) return <Ctx.Provider …><ResetPassword token={resetToken}
-    onDone={() => { window.history.replaceState({}, '', window.location.pathname) }}/></Ctx.Provider>
+  if (resetToken) return <Ctx.Provider …><ResetPassword token={resetToken}
+    onDone={() => {
+      window.history.replaceState({}, '', window.location.pathname)
+      setResetToken(null)
+    }}/></Ctx.Provider>
```

`npm run build` regenerated the bundle; backend restart not required since
FastAPI serves `frontend/dist/` straight from disk. Uncommitted at writing.

### 10. `venv/` vs `.venv/` drift (audit §2) — installer rewrite

**Symptom:** `install.sh` created `backend/venv/` via `python3 -m venv` and
`pip install -r requirements.txt`, but the live systemd unit's `ExecStart`
pointed at `backend/.venv/bin/uvicorn` (uv-managed from `pyproject.toml` +
`uv.lock`). A fresh installer run would set up the pip venv and the service
would fail to start because the unit was looking at a different path.

Mark had manually migrated to uv on his own box, so the live service was
fine, but `dev` → `main` + fresh install on someone else's box would have
tripped on this immediately.

**Fix:** `install.sh` rewritten top to bottom on the Python side:

- Dropped `python3-venv python3-pip` from the apt install line (uv doesn't
  need either).
- Removed the unused `PYTHON="${PYTHON:-python3}"` variable.
- New "uv" section: checks for an existing `uv` binary at `/usr/local/bin/uv`
  or on `$PATH`; if missing, pipes the official astral installer with
  `UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1` so it lands system-wide
  without touching shell rc files.
- "Python environment" section replaced with:

    ```bash
    if [[ -d "$INSTALL_DIR/backend/venv" ]]; then
        rm -rf "$INSTALL_DIR/backend/venv"
    fi
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/backend"
    (cd "$INSTALL_DIR/backend" && sudo -Hu "$SERVICE_USER" "$UV_BIN" sync --frozen)
    ```

  `sudo -H` forces the target user's `$HOME` so uv's managed-Python cache
  lands in the right place. `--frozen` pins exactly to `uv.lock`. The legacy
  `venv/` tree is removed before sync so in-place upgrades migrate cleanly.

- `ExecStart` in the systemd unit literal changed from
  `backend/venv/bin/uvicorn` → `backend/.venv/bin/uvicorn`.
- End-of-install "Update" one-liner rewritten to
  `git pull && (cd backend && uv sync --frozen) && (cd frontend && npm ci && npm run build) && sudo systemctl restart sitrep-api`.

`bash -n install.sh` syntax-checks clean. Legacy `/opt/panel/backend/venv/`
deleted after confirming the running process (PID 188269) was attached to
`.venv/`. Uncommitted at writing.

### 11. Docs sync for `.venv/`

The old `venv/` path was hardcoded in three committed files. Updated all of
them so the repo reads consistently.

- `CLAUDE.md` — load-bearing-venv warning at line 22 + file-layout diagram at
  line 40 both now show `.venv/` and reference `pyproject.toml` + `uv.lock`
  as the source of truth.
- `README.md` — manual-install block uses `curl astral.sh/uv/install.sh | sh`
  + `uv sync --frozen`, systemd unit shows `.venv/bin/uvicorn`, and the
  CLI password-reset recovery recipe at line 418 uses `.venv/bin/python3`.
- `docs/INSTALL.md` — same treatment at lines 67-72 (install steps) and
  line 177 (systemd ExecStart).

Uncommitted at writing.

### 12. Tracker tab never appeared even with the mod loaded

**Symptom:** Mark installed PlayerTracker on the Arma server, the mod was
running, but the Tracker tab never showed up in the panel sidebar. Design
intent (per `project_tracker_tab_design.md`) is that the tab surfaces the
moment the mod starts posting and disappears ~90s after it stops.

**Root cause — two layered bugs.**

**Bug 12a (frontend) — `X-Server-ID` header never sent.** `App.jsx:148` was
a raw `fetch('/api/tracker/status')` with no headers. The auth middleware
at `main.py:689` reads `X-Server-ID` to populate `request.state.server`;
without it, `request.state.server = None`. The tracker status handler at
`main.py:5580` then calls `_tracker_panel_mod_id(request)`, which reads
`request.state.server.tracker_mod_id` — with no server in state, it
unconditionally returned `""`. That made `last_rx` always `0.0`, which made
`mod_wired` always `False`, which made `wired_up` always `False`. The tab
could never appear no matter what the mod did.

All other panel fetches correctly use `authHeaders()` / `getHeaders()` from
`api.js`, which inject `X-Server-ID` from the `_serverId` module var.
The tracker-status poll was the one oversight.

**Bug 12b (backend) — chicken-and-egg on the per-server gate.** The original
design (documented in `project_tracker_tab_design.md` line 85) was:

    "wired_up": bool(_TRACKER_LAST_RX > 0 and (time.time() - _TRACKER_LAST_RX) < 90)

A **global** "any mod posted recently" check — the tab appears as soon as
the mod pings the panel at all.

The PANEL_DATA scoping refactor (part of commit `a98297c fix(tracker):
partition state by mod_server_id — no more cross-server leak`) partitioned
tracker state by `mod_server_id` so multi-server panels don't cross-
contaminate each other's player lists. In the process, `wired_up` was
tightened from the global check to a **per-selected-server** check:

    mod_id = _tracker_panel_mod_id(request)  # selected server's tracker_mod_id
    last_rx = _TRACKER_LAST_RX.get(mod_id, 0.0) if mod_id else 0.0
    mod_wired = bool(last_rx > 0 and (now - last_rx) < 90)

That's correct for precision — each panel server now only shows data from
the mod instance linked to it — but it broke the first-run UX. The
`tracker_mod_id` field is configured **inside** the Tracker tab's
Receiver-settings modal (Tracker.jsx:996-1009 already has the
"Tracker not linked — Open Settings" banner for exactly this case). On a
fresh install:

1. User has no `tracker_mod_id` set on their panel server
2. `_tracker_panel_mod_id(request)` returns `""`
3. `wired_up` is `False`
4. Tab is hidden
5. User can't reach the tab to configure the link
6. Forever

**Fix:** split the visibility signal from the precision signal.

- `backend/main.py:5576` — `/api/tracker/status` now computes **both**
  values. `wired_up` stays as the per-selected-server precision check; a
  new `detected` field is `True` if *any* entry in `_TRACKER_LAST_RX` is
  within the 90s window, regardless of server scoping. The `with
  _TRACKER_STATE_LOCK:` block was widened to cover the global read:

    ```python
    with _TRACKER_STATE_LOCK:
        if mod_id:
            last_rx = _TRACKER_LAST_RX.get(mod_id, 0.0)
            snap_count = len(_TRACKER_LATEST_SNAPSHOTS.get(mod_id, {}))
            evt_count = len(_TRACKER_RECENT_EVENTS.get(mod_id, ()))
        any_recent_rx = max(_TRACKER_LAST_RX.values(), default=0.0)
    mod_wired = bool(last_rx > 0 and (now - last_rx) < 90)
    detected = bool(any_recent_rx > 0 and (now - any_recent_rx) < 90)
    return {
        "wired_up": server_running and mod_wired,
        "detected": detected,
        …
    }
    ```

  **Initial version:** `detected` intentionally did **not** gate on
  `server_running` — the thinking was "if the mod posted within the last
  90s, that's proof enough". That turned out to be wrong in practice — see
  the follow-up fix below.

  `wired_up` keeps its `server_running` gate since it's the precision
  signal used to drive the "Mod Connected" status line inside the tab
  itself.

- `frontend/src/App.jsx:147-150` — the status poll now uses the API helper
  path and injects `X-Server-ID`, and treats either flag as "show the tab":

    ```diff
    - const check=()=>fetch('/api/tracker/status')
    -   .then(r=>r.json())
    -   .then(d=>setTrackerWiredUp(!!d.wired_up))
    -   .catch(()=>{})
    + const check=()=>fetch(`${API}/tracker/status`,{headers:getHeaders()})
    +   .then(r=>r.json())
    +   .then(d=>setTrackerWiredUp(!!(d.wired_up||d.detected)))
    +   .catch(()=>{})
    ```

  `getHeaders` was already imported at `App.jsx:3`. The `trackerWiredUp`
  state var name stayed (scope-creep avoidance) even though it now means
  "should the tab render" rather than strictly "is the mod wired to this
  server".

**End-to-end UX after the fix:**

1. User installs SITREP + PlayerTracker on the Arma server
2. Mod POSTs to `/api/tracker/track` with `X-Api-Key` matching
   `PLAYERTRACKER_API_KEY` (or localhost gets a free pass via
   `_tracker_check_key`)
3. Next frontend poll (≤8s later) sees `detected: true`
4. Tracker tab appears in the sidebar
5. User opens it — Tracker.jsx:996 "Tracker not linked" banner shows
6. "Open Settings" button routes to the Receiver modal
7. `_tracker_recent_mod_ids()` surfaces the unassigned `mod_server_id`
8. User clicks assign — `POST /api/tracker/set_mod_id` writes it to the
   panel server's config
9. Next poll flips `wired_up: true`, banner disappears, full tab UI unlocks

**Verification:**

```bash
$ curl -s http://127.0.0.1:8000/api/tracker/status | python3 -m json.tool
{
    "wired_up": false,
    "detected": false,
    "server_running": false,
    "configured": false,
    "mod_server_id": null,
    "last_rx": null,
    "snapshot_count": 0,
    "event_count": 0,
    "sqlite_enabled": false,
    "key_configured": true
}
```

New `detected` field present, `key_configured: true` confirms
`PLAYERTRACKER_API_KEY` is still wired from `.env`. Bundle rebuilt to
`index-BuHii5qP.js`, backend restarted cleanly. Uncommitted at writing.

### 12b. Tracker tab didn't disappear when the server stopped

**Symptom (follow-up to §12):** after the §12 fix landed, Mark confirmed
the tab now appeared when he started the Arma server. But when he stopped
the server, the tab stuck around.

**Root cause:** `_TRACKER_LAST_RX` is an in-memory dict that only grows —
entries are written by `/api/tracker/track` and `/api/tracker/event` but
are never pruned. When the Arma server stops, the mod stops posting, but
the last timestamp it wrote lingers in the dict until the uvicorn process
restarts. The §12 version of `detected` was:

    detected = bool(any_recent_rx > 0 and (now - any_recent_rx) < 90)

No `server_running` gate. So after a stop, `detected` stayed `True` for the
full 90s staleness window even though nothing was actively posting — the
staleness window was the only signal, and it was still open.

Live repro captured in the endpoint just before the fix:

    {
      "wired_up": false,      # server stopped → per-server gate fires
      "detected": true,       # ← still true because _TRACKER_LAST_RX is stale
      "server_running": false,
      ...
    }

Tab visibility is `wired_up || detected`, so `detected: true` alone kept
the tab mounted.

**Fix:** `backend/main.py:5597` — gate `detected` on `server_running` as
well:

    detected = bool(server_running and any_recent_rx > 0 and (now - any_recent_rx) < 90)

Rationale: if no server is running, the mod physically cannot be posting,
so a recent-looking `_TRACKER_LAST_RX` can only mean stale state. The gate
makes the tab disappear on the next frontend poll (≤8s) instead of waiting
≤90s for the timestamp to age out. Doc comment added inline explaining
*why* the gate matters so a future reader doesn't remove it thinking it's
redundant with the per-server `wired_up` gate.

**Verification:**

    $ curl -s http://127.0.0.1:8000/api/tracker/status | python3 -m json.tool
    {
      "wired_up": false,
      "detected": false,    # ← now follows server_running
      "server_running": false,
      ...
    }

Backend restart cleared `_TRACKER_LAST_RX` as a side effect, but the gate
is the actual fix — the next fresh start/stop cycle will exercise it
without needing a restart. Frontend unchanged (still uses
`wired_up || detected`). Uncommitted at writing.

## Environmental state (not in git)

These changes landed on Mark's box but aren't part of the shippable repo:

- `/opt/panel/.env`:
    ```
    PANEL_URL=https://<his-domain>
    PLAYERTRACKER_API_KEY=<preserved>
    ```
- `/opt/panel/backend/data/settings.json`:
    - `discord_redirect_uri`: `""` (was `/api/auth/discord/callback`)
    - `frontend_url`: `""` (was `http://<LAN-IP>:8000`)
    - SMTP config preserved (Gmail app password)
    - Discord client id + secret preserved
- `/opt/panel/backend/venv/`: deleted (was legacy pip venv, live service on `.venv/`)

## Ship scrub — personal data out of committed files

Before staging, swept the working tree for anything that ties the repo to
Mark's specific deployment. The rule: a fresh `git clone` + `sudo bash
install.sh` on a brand-new box must produce a working panel with zero
references to Mark's domain, LAN IP, mod auth key, Discord app, or email.

**Files scrubbed (working-tree only — see "Git history note" below):**

| File | Before | After |
|------|--------|-------|
| `.env.example` | `PANEL_URL=http://192.168.1.16:8000` | `PANEL_URL=http://localhost:8000`, added `PLAYERTRACKER_API_KEY` doc block |
| `frontend/src/tabs/Permissions.jsx` | Discord client id `1485073389164167341` as placeholder, LAN IP `192.168.1.16:8000` in help text | generic `1234567890123456789` + `192.168.1.100:8000` |
| `docs/session-2026-04-10-tracker-polish.md` | Real `PLAYERTRACKER_API_KEY` in fenced block | `<redacted — install.sh now auto-generates this on first install>` |
| `docs/session-2026-04-11-ship-prep.md` (this file) | `sitreppanel.com`, `192.168.1.16` in narrative | `<his-domain>`, `<LAN-IP>` placeholders |

**Verification:**

    $ grep -rE 'sitreppanel|192\.168\.1\.16|1485073389164167341|uqZh_b90HS5ru|markammo28' /opt/panel
    (no matches)

**Git history note:** these redactions only touch the working tree. Commits
already in the `dev` history still contain the original strings:

- `3e39715 docs: session writeup for tracker polish` — contains the old
  `PLAYERTRACKER_API_KEY`
- `4769006 Initial release` (already on `origin/main`) — contains the old
  `192.168.1.16` PANEL_URL
- `2f52284`, `88702f9` — contain `sitreppanel.com` references

The LAN IP isn't a secret. The Discord placeholder id isn't a credential. The
**tracker API key is the only actual secret** in history, and the mitigation is
to rotate it in the panel UI (Tracker tab → Receiver → Rotate Key) before
pushing `dev` to any public remote. After rotation the old key in history is
an expired token.

If Mark wants a clean-history ship, the nuclear option is
`git filter-repo --replace-text` — but that rewrites every commit SHA and
anyone with the repo cloned has to re-fetch. **Not** doing that without
explicit approval.

## Fresh-install coverage — what `install.sh` sets up automatically

The goal stated at the top of this session was "fresh user can
`curl | sudo bash` and it Just Works". Here's exactly what the installer
takes care of, what first-boot handles, and what's left for the user:

### Auto-configured by `install.sh`

| Item | How |
|------|-----|
| System deps | `apt-get install git curl python3` |
| Node.js 20 | NodeSource `setup_20.x` → `apt-get install nodejs` |
| SteamCMD | `add-apt-repository multiverse`, `i386` arch, debconf auto-accept EULA |
| Arma Reforger dedicated server | SteamCMD `+app_update 1874900`, 3 retry attempts |
| Default Arma `config.json` | Starter config with `21_GM_Eden.conf`, RCON on `:19999`, 64-slot |
| `arma-reforger.service` | systemd unit, enabled (user starts it from panel) |
| `uv` | `curl astral.sh/uv/install.sh` → `/usr/local/bin/uv` |
| Python venv | `uv sync --frozen` in `backend/` — auto-fetches Python 3.12 if host lacks it |
| Frontend build | `npm ci && npm run build` |
| `PANEL_URL` | Prompted with `hostname -I` default; auto-accepts default on WSL / piped installs |
| `PANEL_INSTALL_DIR` | Set to `$INSTALL_DIR` |
| `PLAYERTRACKER_API_KEY` | Auto-generated via `openssl rand -base64 33 \| tr -d '\n+/=' \| head -c 43` with `/dev/urandom` fallback |
| `.env` permissions | `chmod 600` |
| Service user detection | Uses `$SUDO_USER`, falls back to UID 1000 |
| `sitrep-api.service` | systemd unit pointing at `.venv/bin/uvicorn`, `Restart=always` |
| `NOPASSWD` sudoers | `/etc/sudoers.d/sitrep` for `systemctl` (so the panel can start/stop game services) |
| UFW rules | `8000/tcp` panel, `2001/udp` game, `17777/udp` query, `19999/tcp` RCON — only if UFW active |
| WSL detection | Warns if systemd isn't enabled, aborts cleanly with instructions |

### Auto-handled at first backend boot

| Item | How |
|------|-----|
| `SECRET_KEY` | `get_or_create_secret()` at `main.py:345` — writes `backend/data/secret.key` mode 0600 |
| `backend/data/settings.json` | Lazily created by `load_settings()` with `SETTINGS_DEFAULTS` when first read |
| First admin account | Setup wizard shown on first browser visit, takes username/password + optional Discord link |
| Session cookies | `COOKIE_SECURE` keyed off `PANEL_URL` scheme — HTTPS deploys get `Secure` flag automatically |

### Requires user action (can't be auto-configured)

| Item | Where |
|------|-------|
| Discord OAuth app | User creates app at discord.com/developers, pastes client id/secret into Permissions tab → Discord |
| SMTP credentials | Permissions tab → Email / SMTP (provider-first dropdown: Gmail, SendGrid, Mailgun, Resend, Postmark, Fastmail, custom) |
| Router port forwards | `docs/PORT_FORWARDING.md` — router-specific, can't be scripted |
| PlayerTracker mod in Workbench | User builds mod + drops in server addons/ — instructions in the Tracker → Receiver tab |

### Small installer fix this session

`LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")`
had a bug: the `|| echo` only fired on pipeline failure, so on a host where
`hostname -I` succeeds but returns empty (e.g. no configured network), the
installer would build `DEFAULT_URL="http://:8000"`. Changed to:

    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    [[ -z "$LOCAL_IP" ]] && LOCAL_IP="localhost"

Syntax-checked with `bash -n`. Uncommitted at writing.

## Known follow-ups

- **Discord portal:** add
  `https://<his-domain>/api/auth/discord/callback` to the Discord app's
  OAuth2 → Redirects list before the next Discord-login test. (Backend is
  ready; the only gap is the portal allowlist.)
- **Deferred audit items:** atomic writes (I-1/I-6), structured logging
  (N-2), `shlex.quote` on systemctl args (I-7), WebSocket ticket flow (I-2),
  CSP header (I-3) — all flagged as Phase 2/3/4 in
  `docs/BACKEND_AUDIT_2026-04-11.md`. Not shipping blockers.
- **Commit the pending changes:** `App.jsx`, `install.sh`, `CLAUDE.md`,
  `README.md`, `docs/INSTALL.md` are all modified but unstaged. One commit on
  `dev` covers everything in this doc's "uncommitted at writing" entries.

## One thing that nearly went wrong

Mid-session, a sibling Claude Code process was simultaneously editing `main.py`
for the tracker partitioning / `PANEL_DATA` scoping work. Neither session had
committed; both were stomping each other's uncommitted working tree. The
sibling recovered both halves by patch-extracting this session's in-flight
edits, resolving a conflict on `get_public_settings`, and squashing into
`220d49a`. Lesson for future parallel runs: commit early and often on `dev`,
or coordinate via a task queue instead of a shared working tree. Already
captured in the `project_parallel_session_wipe_incident.md` memory.
