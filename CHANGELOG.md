# SITREP Panel Changelog

## 2026-04-11 (3)

### tools/player-tracker/install.sh (new)
- Created tracker setup script: auto-locates panel `.env`, checks/generates `PLAYERTRACKER_API_KEY`, restarts `sitrep-api` if key was newly written, verifies endpoint is reachable, prints API key and Workbench setup instructions
- Supports `PANEL_DIR=` override for non-default install locations
- Reads `PANEL_URL` from `.env` to show the correct webhook base URL

### tools/player-tracker/README.md
- Rewritten: documents requirements, install command, Workbench setup table, and link to main README

### tools/aigm/install.sh
- Fixed `PANEL_USER=$(id -un)` → `${SUDO_USER:-$(id -un)}` so service runs as the correct user when installer is invoked with sudo

### Backup
- `/home/mark/backups/sitrep-panel-2026-04-11-pre-installers.tar.gz`

---

## 2026-04-11 (2)

### backend/main.py
- Added `os.path.expanduser()` to `AIGM_DIR` and `AIGM_BRIDGE_PATH` reads so `~/` notation works if set in `.env`

### README.md
- AI GM Step 4 rewritten: removed hardcoded `/home/YOUR_USERNAME/` paths; panel auto-detects `~/AIGameMaster`, step now only documents the custom-path override
- Manual install: changed `User=YOUR_USERNAME` heredoc to `User=$(id -un)` (unquoted heredoc so it expands at run time)
- Troubleshooting: replaced `sudo -u YOUR_USERNAME` with `sudo -u "$(id -un)"`

### .env.example
- Added commented `AIGM_DIR` and `AIGM_BRIDGE_PATH` entries documenting the optional custom-path overrides

---

## 2026-04-11

### README.md
- Removed Mercury Enable / ATAK feed references from Player Tracker feature list and section description — Mercury has no connection to this panel
- Removed AAR replay claim from Player Tracker description — the panel tracker is in-memory only, replay is not implemented
- Removed ghost `sitrep-tracker.service` references from the purge/uninstall block — that service does not exist

### tools/player-tracker/
- Removed `install.sh` and `mod/PlayerTrackerComponent.c` — mod is published to Workshop (ID `691608368426C1F2`), source does not belong in this repo
- Added `README.md` — Workshop ID pointer with reference to main README for full setup guide

### frontend/src/tabs/Dashboard.jsx
- Removed BW Estimate dock/float panel (`bwest`) entirely — hardcoded 120 Mbps cap made it meaningless for users with different upload limits
- Removed `bwest` entry from `PANEL_LABELS`

### frontend/src/tabs/Profile.jsx
- Removed `bwest` from `PANEL_DEFS` in the Layout tab

### backend/main.py
- Removed `uploadCapMbps` from `SETTINGS_DEFAULTS` (no longer used)
- Fixed bandwidth rate calculation: `net_io_counters()` was summing all interfaces including loopback (`lo`), causing upload and download to show identical values. Now uses `pernic=True` and sums only non-loopback interfaces
- Fixed CPU/GPU temp sensor reading: now targets `k10temp`/`coretemp` specifically for CPU temp and `amdgpu` for GPU temp instead of reading arbitrary sensors
