# SITREP Panel Changelog

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
