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

## Tool 2: PlayerTracker Mod

### How it works

```
Arma Reforger server
  └── PlayerTrackerComponent.c (EnScript mod)
        ├── POST /api/tracker/track  →  panel backend (in-memory + SQLite)
        └── POST /api/tracker/event →  panel backend
                                              ↓
                                     WebSocket /ws/tracker
                                              ↓
                                     panel Tracker tab (live map)
                                              ↓
                              forward destinations (Mercury/ATAK, webhooks)
```

The mod is an EnScript component added to a scenario in Arma Reforger Workbench.
Once deployed, it POSTs player snapshots and game events directly to the panel's
built-in `/api/tracker/*` endpoints — **no separate relay process required**.

The panel handles everything: in-memory state, SQLite persistence, WebSocket
broadcast to the Tracker tab, and configurable forwarding destinations (e.g.
Mercury Enable ATAK).

### Installation

```bash
cd /opt/panel/tools/player-tracker
bash install.sh [--mods-dir /path/to/arma/mods] [--panel-env /path/to/.env]
```

The installer copies `mod/PlayerTrackerComponent.c` into the Arma mods directory
and prints the API key to configure in Workbench.

Default paths:
- `--mods-dir` → `/opt/arma-reforger/mods`
- `--panel-env` → `/opt/panel/.env` (reads `PLAYERTRACKER_API_KEY`)

### Workbench configuration

After running the installer, open your scenario in Arma Reforger Workbench:

1. Add `PlayerTrackerComponent` to the game mode entity.
2. Set **Webhook base URL** → `http://<panel-host>:8000/` (trailing slash required).
3. Set **API key** → value of `PLAYERTRACKER_API_KEY` from the panel `.env`.

The mod derives `server_id` automatically from `DSConfig.publicAddress:publicPort`.

### Panel configuration

The panel reads one env var:

| Variable | Description |
|----------|-------------|
| `PLAYERTRACKER_API_KEY` | Shared secret — must match the mod's Workbench attribute |

Set or rotate the key via **Settings → Tracker** in the panel UI, or edit `.env`
directly and restart the panel.

### Files

```
tools/player-tracker/
├── install.sh
└── mod/
    └── PlayerTrackerComponent.c
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
│       ├── install.sh
│       └── mod/
│           └── PlayerTrackerComponent.c
└── docs/
    └── 2026-04-11/
        └── tools/
            └── tools-integration.md   ← this file
```
