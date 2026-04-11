# SITREP Panel — Installation Guide

**SITREP** is a self-hosted web panel for managing an Arma Reforger dedicated server on Linux.  
It provides server control, live monitoring, mod workshop, file browser, player/ban management, and an AI Game Master interface.

---

## Requirements

| Component | Minimum | Notes |
|---|---|---|
| OS | Ubuntu 22.04 / Debian 12 | Other systemd-based distros may work |
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | For building the frontend |
| npm | 9+ | Comes with Node.js |
| Arma Reforger Server | Any | Must be installed separately via SteamCMD |
| RAM | 2 GB free | Beyond what the game server uses |
| Disk | 500 MB | For panel + workshop index cache |

**Optional:**
- NVIDIA GPU + Ollama — for the AI Game Master tab
- Discord app credentials — for Discord OAuth login

---

## Step 1 — Install System Dependencies

```bash
# Python 3.11+ and pip
sudo apt update
sudo apt install -y python3 python3-pip python3-venv

# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build tools (needed for some Python packages)
sudo apt install -y build-essential
```

---

## Step 2 — Create a Dedicated User (Recommended)

Running the panel and game server under a dedicated user is strongly recommended.

```bash
sudo useradd -m -s /bin/bash arma
sudo usermod -aG sudo arma   # needed for systemd service management via sudoers
```

All subsequent steps assume this user. Adjust if you run as a different user.

---

## Step 3 — Install the Panel

```bash
# Clone or extract the panel to /opt/panel
sudo mkdir -p /opt/panel
sudo chown arma:arma /opt/panel

# As the arma user:
cd /opt/panel
# (copy your panel files here)

# Create the Python virtual environment with uv
# (installs uv if you don't have it — see https://docs.astral.sh/uv/ for alternatives)
curl -LsSf https://astral.sh/uv/install.sh | sh
cd /opt/panel/backend
uv sync --frozen
```

---

## Step 4 — Configure the Environment

Copy the example environment file and edit it:

```bash
cp /opt/panel/.env.example /opt/panel/.env
nano /opt/panel/.env
```

### Required settings

```env
# The URL users will access the panel from.
# Use your server's LAN IP, public IP, or domain name.
# Example (LAN):       http://192.168.1.10:8000
# Example (domain):    https://panel.yourdomain.com
# Example (Tailscale): http://100.x.x.x:8000
PANEL_URL=http://YOUR_SERVER_IP:8000

# The Linux user that will own and run the Arma Reforger server process.
# Must match the User= in your Arma server systemd service.
SERVICE_USER=arma
```

### Optional settings

```env
# Override the auto-generated secret key (useful if you need a fixed key across restarts)
# SECRET_KEY=your-64-char-hex-secret

# Path to the AI Game Master bridge script (if using the AI GM feature)
# AIGM_BRIDGE_PATH=/home/arma/AIGameMaster/AIGameMaster/bridge.py

# Directory for the Misfits Admin Tools profile logs (if using MAT mod)
# MAT_PROFILE_DIR=Misfits_Logging
```

---

## Step 5 — Install the Arma Reforger Server

If not already installed:

```bash
# Install SteamCMD
sudo apt install -y steamcmd

# Install Arma Reforger Dedicated Server (App ID 1874900)
steamcmd +force_install_dir /opt/arma-server +login anonymous +app_update 1874900 validate +quit
```

The panel expects the Arma Reforger server to be at `/opt/arma-server` by default. If you install it elsewhere, configure the server path through the panel's **Server Settings** after first login.

---

## Step 6 — Build the Frontend

The panel serves the compiled React frontend as static files. You must build it before first use and after any updates:

```bash
cd /opt/panel/frontend
npm install
npm run build
```

This creates `/opt/panel/frontend/dist/` which the backend serves automatically.

---

## Step 7 — Configure sudo for the Panel

The panel uses `sudo tee` to write systemd service files. Add a sudoers rule:

```bash
sudo visudo -f /etc/sudoers.d/sitrep-panel
```

Add this line (replace `arma` with your service user):
```
arma ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/systemd/system/*.service, /bin/systemctl daemon-reload, /bin/systemctl enable *, /bin/systemctl disable *, /bin/systemctl start *, /bin/systemctl stop *, /bin/systemctl restart *
```

---

## Step 8 — Create the systemd Service

Create the service file for the panel backend:

```bash
sudo nano /etc/systemd/system/sitrep-api.service
```

```ini
[Unit]
Description=SITREP Panel API
After=network.target

[Service]
Type=simple
User=arma
WorkingDirectory=/opt/panel/backend
ExecStart=/opt/panel/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/panel/.env

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sitrep-api
sudo systemctl start sitrep-api
sudo systemctl status sitrep-api
```

---

## Step 9 — First Login & Account Setup

Open your browser and navigate to:
```
http://YOUR_SERVER_IP:8000
```

On first launch, the panel will prompt you to create the **owner** account. This is the highest-privilege account — choose a strong password.

### Role hierarchy (for additional users)

| Role | Capabilities |
|---|---|
| `owner` | Full access, cannot be restricted |
| `head_admin` | All permissions, configurable |
| `admin` | Server control, files, bans, admins |
| `moderator` | Server control, bans, config |
| `viewer` | Read-only, server control only |
| `demo` | Start/stop server and read files only |

---

## Step 10 — Configure Your Server

1. Go to **Settings → Server** in the panel
2. Set the **Arma server install directory** (default: `/opt/arma-server`)
3. Set the **profile directory** (where Arma writes logs and saves)
4. Configure your `config.json` via the **Config** tab

---

## HTTPS Setup (Recommended for Internet-Facing Deployments)

If the panel will be accessible outside your LAN, run it behind a reverse proxy with TLS.

### nginx example

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d panel.yourdomain.com
```

```nginx
server {
    server_name panel.yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;   # needed for WebSocket
    }

    listen 443 ssl; # managed by Certbot
    # ... certbot adds ssl_certificate lines here
}

server {
    listen 80;
    server_name panel.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Update your `.env`:
```env
PANEL_URL=https://panel.yourdomain.com
```

Then restart the panel service:
```bash
sudo systemctl restart sitrep-api
```

---

## AI Game Master (Optional)

The AI GM tab requires a locally running Ollama instance with a compatible model.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (qwen3:8b recommended, requires ~5.2 GB disk + VRAM)
ollama pull qwen3:8b

# Install the bridge dependencies
cd /path/to/AIGameMaster
pip install -r requirements.txt

# Set the bridge path in .env
AIGM_BRIDGE_PATH=/path/to/AIGameMaster/bridge.py
```

Restart the panel after updating `.env`.

---

## Discord OAuth (Optional)

1. Go to [discord.com/developers](https://discord.com/developers/applications) and create an application
2. Under **OAuth2 → Redirects**, add: `http://YOUR_PANEL_URL/api/auth/discord/callback`
3. In the panel: **Settings → Discord** — enter your Client ID, Client Secret, and the redirect URI
4. Users can then link their Discord accounts and log in via Discord

---

## Updating the Panel

```bash
cd /opt/panel

# Pull new code (or replace files manually)
git pull   # if using git

# Rebuild the frontend
cd frontend
npm install
npm run build

# Restart the backend
sudo systemctl restart sitrep-api
```

**Always rebuild the frontend after updating** — the backend serves the compiled `dist/` folder, not the source files directly.

---

## Troubleshooting

### Panel won't start
```bash
sudo journalctl -u sitrep-api -n 50 --no-pager
```

### Port 8000 already in use
```bash
ss -tlnp | grep 8000
```
Change the port in the systemd `ExecStart` line and update `PANEL_URL` in `.env`.

### Workshop shows "unavailable"
The workshop proxy connects to `reforger.armaplatform.com`. Verify your server has internet access:
```bash
curl -I https://reforger.armaplatform.com/workshop
```

### Config changes not appearing in browser
The backend serves compiled static files. After any frontend code changes you must run:
```bash
cd /opt/panel/frontend && npm run build
```
Then hard-refresh the browser (`Ctrl+Shift+R`).

### Arma server shows as offline even when running
Ensure the `service_name` in the panel matches the actual systemd service name:
```bash
systemctl status arma-reforger   # or whatever your service is named
```

---

## File Layout

```
/opt/panel/
├── .env                    ← Your configuration (created from .env.example)
├── .env.example            ← Template — copy to .env
├── backend/
│   ├── main.py             ← FastAPI application
│   ├── requirements.txt    ← Python dependencies
│   ├── venv/               ← Python virtual environment
│   └── data/               ← Runtime data (auto-created)
│       ├── secret.key      ← Auto-generated JWT secret (chmod 600)
│       ├── panel_users.json
│       ├── refresh_tokens.json
│       ├── permissions.json
│       ├── servers.json
│       └── ws_index.json   ← Workshop mod index cache
├── frontend/
│   ├── src/App.jsx         ← React application source
│   ├── dist/               ← Compiled frontend (served by backend)
│   └── package.json
└── docs/
    ├── INSTALL.md          ← This file
    └── QUALITY_REPORT.md   ← Security & quality audit
```

---

## Security Notes

- The `data/secret.key` file is auto-generated on first run with 256 bits of entropy. Back it up — losing it invalidates all active sessions.
- All auth cookies are `HttpOnly` and `SameSite=Strict`. Tokens are never stored in `localStorage`.
- The panel rate-limits login attempts (5 attempts per 5 minutes per IP, 15-minute lockout).
- For internet-facing deployments, always use HTTPS. Run the panel behind nginx/Caddy with a valid TLS certificate.
- The file browser is sandboxed to the Arma install directory and profile directory only.
