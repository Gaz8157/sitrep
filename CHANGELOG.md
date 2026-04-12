# SITREP Panel Changelog

---

## 2026-04-11 (7)

### tools/player-tracker/install.sh
- Added Arma server profile path prompt — operator enters local path or leaves blank if Arma is on a different machine
- Writes `$ARMA_PROFILE_PATH/PlayerTracker/config.cfg` automatically when a local path is given
- Saves `ARMA_PROFILE_PATH` to panel `.env` so future installs skip the prompt
- Setup instructions now show "config file written" confirmation or fallback with file content to copy manually

### tools/player-tracker/README.md
- Documented config file approach as the recommended setup
- Workbench method kept as alternative for remote Arma servers
- Updated install step list to reflect new profile path prompt

### PlayerTracker mod — Mod/Scripts/Game/PlayerTracker/PlayerTrackerComponent.c
- Added `LoadProfileConfig()` — reads `$profile:PlayerTracker/config.cfg` at startup and overrides `m_sWebhookBaseUrl` and `m_sApiKey` if the file exists
- Config file format: simple `key=value` per line, `#` comments supported
- Falls back silently to Workbench attribute values if no config file present
- Called at start of `OnPostInit` before `RestContext` is created

---

## 2026-04-11 (6)

### frontend/src/tabs/AiGm.jsx
- Added ⚙ settings button to AI GM tab header — visible in both bridge online and offline states
- Settings modal covers: RCON host, RCON port, RCON password (masked, show/hide toggle), Ollama URL, Ollama model
- Password field shows placeholder "Leave blank to keep current" when a password is already set
- Save writes to bridge `.env` and automatically restarts `aigm-bridge` service

### backend/main.py
- Added `GET /api/aigm/bridge-settings` — reads bridge `.env`, returns settings with password masked (admin+ only)
- Added `POST /api/aigm/bridge-settings` — writes updated values to bridge `.env`, restarts `aigm-bridge` via systemd (admin+ only)
- Added `_read_bridge_env()` and `_write_bridge_env()` helpers — preserve comments and key order in `.env`
- Password field skips update if left blank (existing password kept)

---

## 2026-04-11 (5)

### README.md
- Fixed AI GM install steps: removed broken `git clone https://github.com/gaz8157/AIGameMaster.git` — bridge is bundled with the panel, no separate repo needed
- Step 2 now points to `sudo bash /opt/panel/scripts/install-aigm.sh` which installs from `tools/aigm/` bundled in the panel repo
- Updated bridge `.env` path to match bundled location: `/opt/panel/tools/aigm/AIGameMaster/.env`
- Removed redundant Step 4 (panel restart) — `scripts/install-aigm.sh` already handles it
- Steps renumbered: 4 steps total

---

## 2026-04-11 (4)

### install.sh
- Installer now always prompts for `PANEL_URL` with the default pre-filled — press Enter to accept, or type a custom URL
- Fixed piped installs (`curl | bash`) silently skipping the prompt: now reads from `/dev/tty` so the prompt appears even when stdin is a pipe
- Falls back to default silently only in truly non-interactive environments (no `/dev/tty`)

---

## 2026-04-11

### Summary
Full session covering: auth fix, tools bundling, tracker/relay cleanup, dashboard panel removal, bandwidth and temp sensor fixes, docs overhaul, hardcoded path removal, and installer creation for both optional features.

**Commits ahead of main:** `9a9294f` → `70b39fd` (7 commits)
**Backups:**
- `/home/mark/backups/sitrep-panel-2026-04-11-pre-rebuild.tar.gz` — pre-rebuild snapshot (commit `f3feaee`)
- `/home/mark/backups/sitrep-panel-2026-04-11-pre-installers.tar.gz` — pre-installer snapshot (commit `f3feaee`)

---

### Auth

**`frontend/src/tabs/Auth.jsx`** — `9a9294f`
- Fixed 2FA input rejecting backup codes: `maxLength` was 8 (TOTP length), blocking the 17-character backup code format; `inputMode` was `numeric`, blocking the hex letters in backup codes. Both fixed.

---

### Dashboard

**`frontend/src/tabs/Dashboard.jsx`** — `29247ca`
- Removed BW Estimate (`bwest`) floating panel and inline docked card entirely. The panel showed a hardcoded 120 Mbps upload cap estimate that was meaningless for users with different connections.
- Removed `bwest` from `PANEL_LABELS`.

**`frontend/src/tabs/Profile.jsx`** — `29247ca`
- Removed `bwest` from `PANEL_DEFS` in the Layout tab so it no longer appears as a layout option.

---

### Backend

**`backend/main.py`** — `29247ca`
- Removed `uploadCapMbps` from `SETTINGS_DEFAULTS` (no longer referenced).
- Fixed bandwidth rate calculation: `net_io_counters()` was aggregating all interfaces including loopback (`lo`), causing upload and download rates to mirror each other under any loopback traffic. Changed to `pernic=True` summing only non-`lo` interfaces — matches the pattern already used in the network endpoint.
- Fixed CPU/GPU temperature sensor reading: was reading arbitrary sensor entries; now specifically targets `k10temp`/`coretemp` for CPU temp and `amdgpu` for GPU temp.

**`backend/main.py`** — `2e5d1ad`
- System tab and `GET /api/system/diagnostics` opened to all authenticated roles (was owner-only).
- Added `POST /api/system/fix/{check_id}` endpoint for admin+ roles to trigger auto-fix handlers.
- Added auto-fix handlers for `panel_data_writable`, `aigm_bridge_service`.
- Added new diagnostic checks: `ollama_reachable`, `aigm-bridge.service`.
- Removed dead `player_tracker_service` diagnostic check and its auto-fix handler — no such service exists; the real failure mode is a missing `PLAYERTRACKER_API_KEY`.

**`backend/main.py`** — `fab7b2e`
- Replaced `player_tracker_service` systemd check with `PLAYERTRACKER_API_KEY` configured check.

**`backend/main.py`** — `f3feaee`
- Wrapped `AIGM_DIR` and `AIGM_BRIDGE_PATH` env var reads in `os.path.expanduser()` so `~/` notation works when set manually in `.env`.

---

### Tools — AI GM

**`tools/aigm/`** — `2e5d1ad`
- Bundled full AI GM bridge: `bridge.py`, `data/`, `tests/`, `AIGameMaster/dashboard/` source.
- Added `tools/aigm/install.sh` — sets up Python venv, installs deps, checks Ollama, pulls configured model, registers `aigm-bridge` as a systemd service.
- Added `tools/aigm/AIGameMaster/.env.example` and `tools/aigm/AIGameMaster/dashboard/.env.local.example` with placeholder values (no live credentials).
- Added `requirements.txt` (was missing from source repo).

**`tools/aigm/install.sh`** — `70b39fd`
- Fixed `PANEL_USER=$(id -un)` → `${SUDO_USER:-$(id -un)}` so the systemd service runs as the correct non-root user when the installer is invoked with `sudo`.

**`scripts/install-aigm.sh`** — `2e5d1ad`
- Switched from GitHub `git clone` to the bundled `tools/aigm/` path.
- Fixed `AIGM_BRIDGE_PATH` env var (old script was writing `AIGM_DIR` which the backend does not read for bridge path).

---

### Tools — Player Tracker

**`tools/player-tracker/`** — `2e5d1ad` → `fab7b2e` → `26cbcda` → `70b39fd`

Evolution across commits:
1. `2e5d1ad` — Added a scratch `Relay/server.py` (standalone receiver). Wrong approach — panel backend already has all tracker endpoints built in.
2. `fab7b2e` — Removed `Relay/` entirely. Added `mod/PlayerTrackerComponent.c` (from tested standalone zip) and a first-pass `install.sh`.
3. `26cbcda` — Removed `mod/PlayerTrackerComponent.c` (mod is published to Workshop ID `691608368426C1F2`, source doesn't belong in panel repo). Removed `install.sh`. Added stub `README.md`.
4. `70b39fd` — Created proper `install.sh` (see below). Rewrote `README.md`.

**`tools/player-tracker/install.sh`** — `70b39fd` (final)
- Auto-locates panel at `/opt/panel` (or `PANEL_DIR=` override).
- Checks for `PLAYERTRACKER_API_KEY` in panel `.env`; generates and appends one if absent.
- Restarts `sitrep-api` if a new key was written.
- Verifies `/api/tracker/status` is reachable.
- Reads `PANEL_URL` from `.env` and prints full Workbench setup instructions with the actual webhook URL and key.

**`tools/player-tracker/README.md`** — `70b39fd` (final)
- Documents requirements, install command, `PANEL_DIR=` override, Workbench attribute table, and link to main README.

**`frontend/src/tabs/System.jsx`** — `fab7b2e`
- Removed `player_tracker_service` from `AUTO_FIXABLE` set (service does not exist).

---

### Docs / README

**`README.md`** — `26cbcda`
- Removed Mercury Enable / ATAK feed references from Player Tracker feature list and section — Mercury has no connection to this panel.
- Removed AAR replay claim from Player Tracker section — the panel tracker is in-memory only, no replay implemented.
- Removed ghost `sitrep-tracker.service` entries from the purge/uninstall block — that service has never existed.

**`README.md`** — `f3feaee`
- AI GM Step 4 rewritten: removed hardcoded `/home/YOUR_USERNAME/` paths. Panel auto-detects `~/AIGameMaster`; step now only documents the custom-path override.
- Manual install block: changed `User=YOUR_USERNAME` in single-quoted heredoc to `User=$(id -un)` in unquoted heredoc so it expands at run time.
- Troubleshooting: replaced `sudo -u YOUR_USERNAME` with `sudo -u "$(id -un)"`.

**`.env.example`** — `f3feaee`
- Added commented `AIGM_DIR` and `AIGM_BRIDGE_PATH` entries with note that panel auto-detects `~/AIGameMaster`.

**`docs/`** — `2e5d1ad`
- Reorganized session docs into `docs/2026-04-10/` and `docs/2026-04-11/` date subdirs.
- Added backend audit docs under `docs/2026-04-11/backend/`.
- Added `docs/2026-04-11/tools/tools-integration.md`.
