# Player Tracker

Optional feature for the SITREP panel. Displays live player positions, 8/10-digit MGRS grids, player status, faction, squad, and nearest location in a dedicated Tracker tab.

## Requirements

- SITREP panel installed and running
- Arma Reforger server with Workshop mod **691608368426C1F2** (PlayerTracker) loaded

## Install

```bash
sudo bash /opt/panel/tools/player-tracker/install.sh
```

The installer will:
1. Find your panel and `.env` automatically
2. Generate a `PLAYERTRACKER_API_KEY` if one isn't set
3. Restart the panel service to apply the key
4. Ask for your Arma server profile path
5. Write `$profile:PlayerTracker/config.cfg` with your panel URL and key
6. Print your key and final setup instructions

If your panel is at a non-default location:
```bash
PANEL_DIR=/your/panel/path sudo bash /opt/panel/tools/player-tracker/install.sh
```

## How the API key works

The panel generates a unique key. The mod must send the same key with every request — the panel rejects anything that doesn't match. The installer writes the correct key into the mod's config file automatically. If the Arma server is on a different machine, copy the key from the installer output into `$profile:PlayerTracker/config.cfg` on the Arma server.

## Config file

The mod reads `$profile:PlayerTracker/config.cfg` on startup. On first run it creates this file automatically with placeholder values. The installer (or the Mod Setup tab in the panel) overwrites it with the real values.

```
# PlayerTracker config
url=https://yourpanel.com/
api_key=YOUR_GENERATED_KEY
track_path=api/tracker/track
event_path=api/tracker/event
update_interval=10
```

The **Mod Setup tab** (Tracker → ⚙ → Mod Setup) lets you write this file directly from the panel UI without touching the command line.

## Full documentation

See the main [README](../../README.md#player-tracker-optional) for the complete setup guide.
