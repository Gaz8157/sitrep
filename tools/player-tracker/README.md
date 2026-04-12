# Player Tracker

Optional feature for the SITREP panel. Displays live player positions, 8/10-digit MGRS grids, player status, faction, squad, and nearest location in a dedicated Tracker tab.

## Requirements

- SITREP panel installed and running
- Arma Reforger server with Workshop mod **691608368426C1F2** (PlayerTracker) loaded

## Install

```bash
bash /opt/panel/tools/player-tracker/install.sh
```

The script will:
1. Find your panel `.env` automatically
2. Generate a `PLAYERTRACKER_API_KEY` if one isn't set
3. Restart the panel service
4. Ask for your Arma server profile path (optional — only needed if Arma is on the same machine)
5. Write a `config.cfg` to `$profile:PlayerTracker/config.cfg` if a local path was given
6. Print your API key and setup instructions

If your panel is installed to a non-default location:

```bash
PANEL_DIR=/your/panel/path bash /opt/panel/tools/player-tracker/install.sh
```

## Config file (recommended)

The mod reads `$profile:PlayerTracker/config.cfg` on startup. If the file exists, it overrides the Workbench attribute values — no Workbench editing required.

File format:
```
# PlayerTracker config
url=https://yourpanel.com/
api_key=YOUR_API_KEY
```

Drop this file in the `PlayerTracker/` subdirectory of your Arma server's profile folder. The installer writes it automatically if Arma is on the same machine.

## Workbench setup (alternative)

If you prefer Workbench or your Arma server is on a different machine without file access, open your scenario in Arma Reforger Workbench, select the game mode entity, and set the **PlayerTrackerComponent** attributes:

| Attribute | Value |
|-----------|-------|
| Webhook base URL | `https://yourpanel.com/` (trailing slash required) |
| API key | printed by the installer |

The config file takes priority over Workbench values if both are present.

## Full documentation

See the main [README](../../README.md#player-tracker-optional) for the complete setup guide.
