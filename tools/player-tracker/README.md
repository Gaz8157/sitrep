# Player Tracker

Optional feature for the SITREP panel. Displays live player positions, 8/10-digit MGRS grids, player status, faction, squad, and nearest location in a dedicated Tracker tab.

## Requirements

- SITREP panel installed and running
- Arma Reforger server with Workshop mod **691608368426C1F2** (PlayerTracker) loaded

## Install

Run from the panel directory:

```bash
bash /opt/panel/tools/player-tracker/install.sh
```

The script will:
1. Find your panel `.env` automatically
2. Generate a `PLAYERTRACKER_API_KEY` if one isn't set
3. Restart the panel service
4. Print your API key and Workbench setup instructions

If your panel is installed to a non-default location:

```bash
PANEL_DIR=/your/panel/path bash /opt/panel/tools/player-tracker/install.sh
```

## Workbench setup

After running the installer, open your scenario in Arma Reforger Workbench, select the game mode entity, and set the **PlayerTrackerComponent** attributes:

| Attribute | Value |
|-----------|-------|
| Webhook base URL | `http://YOUR_SERVER_IP:8000/` |
| API key | printed by the installer |

The Tracker tab appears in the panel sidebar within 8 seconds of the first mod POST and disappears 90 seconds after the mod goes silent.

## Full documentation

See the main [README](../../README.md#player-tracker-optional) for the complete setup guide.
