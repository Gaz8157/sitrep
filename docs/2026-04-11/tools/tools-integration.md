# SITREP Panel — Tools Integration

## Overview

The panel ships with optional tool integrations. These are independent services
that extend the panel's capabilities. Each tool has its own installation path;
the panel frontend/backend wire up to them automatically once installed.

---

## Audit Summary (2026-04-11)

### Panel state at time of integration

| File | Finding |
|------|---------|
| `frontend/src/constants.js:84` | `system` tab present for `owner` only — all other roles missing it |
| `frontend/src/tabs/System.jsx:59` | Hard `role !== 'owner'` guard — non-owners see "Owner access required" |
| `backend/main.py:1958` | `GET /api/system/diagnostics` — 403 for all non-owners |
| `_run_diagnostics()` (line 837) | 10 checks: sudoers, 4×sudo probes, arma binary, systemd dir, disk, data dir writable, uv lock |
| Fix UX | Copy-only clipboard blocks. No auto-execute path. |
| Tracker | Full tracker system built-in. Mod posts directly to panel. |
| AIGM | All AIGM endpoints exist. `AIGM_BRIDGE_PATH` is wired. Bridge must be STARTED manually. |

### Changes made

#### `frontend/src/constants.js`
- Added `system` to: `head_admin`, `admin`, `moderator`, `viewer`, `demo`

#### `frontend/src/tabs/System.jsx`
- Removed `role !== 'owner'` guard
- Added Fix buttons for three safe auto-fixable checks
- Added Tools section (AI GM bridge status, PlayerTracker relay status)
- Fixed 403 error handler (was "Owner only" — now generic)

#### `backend/main.py`
- `GET /api/system/diagnostics` — opened to all authenticated users
- Added `POST /api/system/fix/{check_id}` — safe auto-fix endpoint
- Added three new diagnostic checks: `ollama_reachable`, `aigm_bridge_service`, `player_tracker_service`

---

## Tool 1: AI Game Master Bridge

### How it works

```
Arma mod (Reforger) → RCON → bridge.py (FastAPI, port 5555) → Ollama LLM
                                      ↓
                              panel backend proxies all /api/aigm/* calls
```

The bridge is a FastAPI/uvicorn server running locally. It connects to an Ollama
instance to run an LLM (default: qwen2.5:14b). The panel proxies all AI GM
requests through to the bridge.

**The bridge does NOT start automatically.** A panel user with `aigm` tab access
must start it via the AI GM tab, or an admin can run it directly.

### Installation

```bash
cd /opt/panel/tools/aigm
bash install.sh
```

The installer:
1. Checks for Python 3.10+ and pip
2. Creates a virtualenv and installs `requirements.txt`
3. Copies `.env.example` to `.env` (edit before running)
4. Installs `aigm-bridge.service` systemd unit
5. Prompts for Ollama model pull

### Configuration

Copy `.env.example` to `.env` and set:

```
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:14b
BRIDGE_PORT=5555
ARMA_RCON_HOST=127.0.0.1
ARMA_RCON_PORT=2302
ARMA_RCON_PASSWORD=<your rcon password>
```

### Dashboard (optional)

The AI GM ships with a standalone Next.js tactical dashboard at `tools/aigm/AIGameMaster/dashboard/`.
This is a separate web app — not the SITREP panel. To use it:

```bash
cd /opt/panel/tools/aigm/AIGameMaster/dashboard
cp .env.local.example .env.local
# Edit .env.local — set AUTH_SECRET (generate with: openssl rand -hex 32)
# Set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET if using Discord auth
npm install
npm run build
node server.mjs
```

### Files

```
tools/aigm/
├── install.sh
├── docker-compose.yml
└── AIGameMaster/
    ├── bridge.py              ← main bridge server
    ├── Dockerfile
    ├── .env.example           ← all placeholders, no credentials
    ├── requirements.txt
    ├── data/
    │   ├── intent.py
    │   ├── operation.py
    │   ├── prompts.py
    │   ├── arma_reference_data.json
    │   ├── military_doctrine_reference.json
    │   └── schedule.json
    ├── tests/
    │   ├── test_intent.py
    │   ├── test_operation.py
    │   └── test_prompts.py
    └── dashboard/
        ├── .env.local.example ← all placeholders, safe to commit
        ├── src/               ← 34 source files (Next.js 16)
        └── ...
```

---

## Tool 2: PlayerTracker Relay

### How it works

```
Arma mod (Workshop install) → POST /track → Relay server (port 5556)
                                                  ↓
                                         SQLite (tracker.db)
                                                  ↓
                                    Mercury Enable ATAK webhook (optional)
```

The Arma mod is installed via the **Arma Reforger Workshop** — it has nothing to
do with the panel installer. Once the server loads the mod, the mod POSTs player
snapshots to the relay.

The relay is STANDALONE. It does not integrate with the panel's own tracker
system — it handles Mercury/ATAK forwarding and AAR replay data.

The panel's built-in tracker tab (`/api/tracker/track`) receives data DIRECTLY
from the mod via a separate endpoint. Both can run simultaneously.

### Installation

```bash
cd /opt/panel/tools/player-tracker/Relay
bash install.sh
```

The installer:
1. Creates a virtualenv and installs `requirements.txt`
2. Copies `config.json` to `config.local.json` for editing
3. Installs `player-tracker.service` systemd unit

### Configuration

Edit `config.json`:

```json
{
  "port": 5556,
  "api_key": "<change this>",
  "mercury_webhook_url": "<Mercury Enable ATAK webhook URL, or empty>",
  "db_path": "tracker.db",
  "session_gap_minutes": 5
}
```

Environment variables (override config):

| Variable | Default | Description |
|----------|---------|-------------|
| `PT_API_KEY` | `changeme` | Auth key the mod sends |
| `PT_DB_PATH` | `tracker.db` | SQLite database path |
| `PT_MERCURY_URL` | `""` | Mercury webhook URL (leave blank to disable) |
| `PT_SESSION_GAP` | `300` | Seconds gap = new session |
| `PT_PORT` | `5556` | Listen port |

### API

#### `POST /track`

Receives a player snapshot from the mod.

```json
{
  "server_id": "my-server",
  "api_key": "...",
  "game": "ArmaReforger",
  "timestamp": 1744300800,
  "map": "Everon",
  "session_time": 100,
  "players_alive": 4,
  "players_total": 4,
  "players": [{
    "uid": "...",
    "name": "PlayerName",
    "status": "alive",
    "grid": "0628-0628",
    "x": 6283.4,
    "z": 6281.7,
    "elevation": 45,
    "heading": 270.5,
    "heading_dir": "W",
    "faction": "US",
    "health": 0.87,
    "in_vehicle": false,
    "vehicle_type": "",
    "is_squad_leader": false,
    "squad_id": 1,
    "squad_name": "Squad 1",
    "is_admin": false,
    "nearest_location": {"name": "Entre Due", "type": "village", "dist": 340}
  }]
}
```

#### `POST /event`

Receives a game event (kill, join, leave, spawn).

```json
{
  "server_id": "my-server",
  "api_key": "...",
  "event_type": "kill",
  "timestamp": 1744300800,
  "data": {}
}
```

### Files

```
tools/player-tracker/
├── README.md
└── Relay/
    ├── install.sh
    ├── server.py          ← FastAPI relay server
    ├── config.json        ← defaults (api_key: "changeme")
    ├── requirements.txt
    └── tests/
        ├── __init__.py
        └── conftest.py
```

---

## System Tab — Diagnostic Checks

All authenticated panel users can view System Health. The tab is visible to all
roles (owner, head_admin, admin, moderator, viewer, demo).

### Auto-fixable checks (Fix button available)

| Check ID | What it fixes | How |
|----------|--------------|-----|
| `panel_data_writable` | Panel data dir permissions | `chown -R <user> /opt/panel/backend/data` |
| `aigm_bridge_service` | AI GM bridge not running | `sudo systemctl restart aigm-bridge` |
| `player_tracker_service` | PlayerTracker relay not running | `sudo systemctl restart player-tracker` |

### Copy-only checks (no auto-fix)

| Check ID | Why manual only |
|----------|----------------|
| `sudoers_file` | Modifies `/etc/sudoers.d/` — requires human review |
| `sudo_*` | Means update.sh needs to run — human decision |
| `arma_binary` | SteamCMD install — disk-consuming, human decision |
| `disk_space` | Cannot decide what to delete |
| `uv_lock` | Touches Python environment |

### Tool-specific checks (informational)

| Check ID | What it checks |
|----------|---------------|
| `ollama_reachable` | GET `localhost:11434` — warns if not responding |
| `aigm_bridge_service` | `aigm-bridge.service` installed + active |
| `player_tracker_service` | `player-tracker.service` installed + active |

---

## Directory Layout

```
/opt/panel/
├── tools/
│   ├── aigm/
│   │   ├── install.sh
│   │   ├── docker-compose.yml
│   │   └── AIGameMaster/
│   │       ├── bridge.py
│   │       ├── Dockerfile
│   │       ├── .env.example
│   │       ├── requirements.txt
│   │       ├── data/
│   │       ├── tests/
│   │       └── dashboard/
│   │           ├── .env.local.example
│   │           └── src/
│   └── player-tracker/
│       └── Relay/
│           ├── install.sh
│           ├── server.py
│           ├── config.json
│           ├── requirements.txt
│           └── tests/
└── docs/
    └── TOOLS_INTEGRATION.md   ← this file
```
