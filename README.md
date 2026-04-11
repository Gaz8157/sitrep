# SITREP — Arma Reforger Server Panel

> **Beta** — actively developed. Expect updates.

A self-hosted web panel for managing Arma Reforger dedicated servers on Ubuntu.
Built with FastAPI + React.

---

## Features

- **Dashboard** — live server status, CPU/GPU/RAM/disk/network charts, console tail
- **Console** — 1000-line buffer, level/source filters, regex search, RCON broadcast, export
- **Players** — live player list, full session history, K/D stats, faction tracking
- **Admin** — in-game admin management, player bans, IP bans, troll alerts
- **Config** — visual config editor + raw JSON for all server config files
- **Mods** — mod list management, add/remove, workshop search
- **Files** — file browser with viewer and editor
- **Startup** — command-line flag management, startup diagnostics (broken mod detection)
- **Scheduler** — crontab manager with presets (auto-restart, SteamCMD updates, log cleanup)
- **Network** — live bandwidth charts, port status, UPnP, RCON connectivity
- **Webhooks** — Discord webhook integration
- **AI Game Master** — optional AI GM tab (requires separate bridge setup, mod ID `68E44E4AE677D389`)
- **Player Tracker** — live map with player positions, 8/10-digit grid refs, AAR replay, ATAK feed (requires PlayerTracker mod ID `691608368426C1F2`)
- **System** — owner-only self-diagnostics tab with 10 health checks and traffic-light status (sudo access, disk, Arma binary, sudoers, etc.)
- **Multi-server** — manage multiple Arma Reforger instances from one panel
- **Auth** — user accounts with roles: owner / head_admin / admin / moderator / viewer / demo
- **2FA** — authenticator app (TOTP) with backup codes
- **Setup wizard** — guided first-run setup with account creation and optional 2FA
- **Themes** — Midnight, Daylight, Tactical, Ember
- **Mobile** — fully responsive, works on phone and tablet

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 22.04 or 24.04 | Other distros not supported |
| `sudo` access | Installer needs root to set up systemd |
| NVIDIA GPU + `nvidia-smi` | Optional — for GPU stats in the dashboard |

Everything else (Arma Reforger server, SteamCMD, Node.js, Python) is installed automatically by the one-liner.

> **Windows users:** Run the panel inside WSL 2 with Ubuntu. See [WSL Setup](#wsl-setup) below.

---

## Installation

### One-liner (recommended)

```bash
curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
```

The installer will:
1. Install system dependencies (Node.js 20, Python 3, SteamCMD)
2. Download and install the Arma Reforger dedicated server to `/opt/arma-server/`
3. Create a starter `config.json` and register the `arma-reforger` systemd service
4. Clone the panel to `/opt/panel` and build the frontend
5. Create a `sitrep-api` systemd service on port 8000 and start it
6. Open firewall ports (8000, 2001, 17777, 19999) if UFW is active

**Open your browser to `http://YOUR_SERVER_IP:8000` and complete the setup wizard to create your owner account.**

To use a custom install directory:
```bash
SITREP_INSTALL_DIR=/opt/myserver curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
```

### Manual install

```bash
# Clone
sudo git clone https://github.com/gaz8157/sitrep.git /opt/panel
cd /opt/panel

# Python environment (uv manages it from backend/pyproject.toml + uv.lock)
# Install uv once: https://docs.astral.sh/uv/getting-started/installation/
curl -LsSf https://astral.sh/uv/install.sh | sh
cd backend && uv sync --frozen && cd ..

# Build frontend
cd frontend && npm ci && npm run build && cd ..

# Configure
cp .env.example .env
nano .env   # set PANEL_URL to your server's address

# Systemd service
sudo tee /etc/systemd/system/sitrep-api.service > /dev/null << 'EOF'
[Unit]
Description=SITREP Panel
After=network.target

[Service]
User=YOUR_USERNAME
WorkingDirectory=/opt/panel/backend
EnvironmentFile=-/opt/panel/.env
ExecStart=/opt/panel/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now sitrep-api
```

---

## First Login

After install, open your panel URL in a browser (e.g. `http://YOUR_SERVER_IP:8000`).

On first launch the **setup wizard** will appear:
1. Enter a username, recovery email, and password to create your owner account
2. You'll be prompted to set up two-factor authentication (recommended but optional)
3. Once complete you'll land on the dashboard

Your owner account has full control of the panel and can create additional users from Settings.

---

## Configuration

Edit `/opt/panel/.env` and restart to apply changes:

```bash
nano /opt/panel/.env
sudo systemctl restart sitrep-api
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PANEL_URL` | Yes | Full URL users access the panel at. Used for CORS and Discord OAuth. |
| `SECRET_KEY` | No | Override the auto-generated JWT secret (useful for multi-instance setups). |
| `SMTP_HOST` | No | SMTP server hostname — enables email password reset. |
| `SMTP_PORT` | No | SMTP port (default: 587). |
| `SMTP_USER` | No | SMTP login username. |
| `SMTP_PASS` | No | SMTP login password (use an app password for Gmail). |
| `SMTP_FROM` | No | From address for reset emails. Defaults to `SMTP_USER`. |
| `AIGM_DIR` | No | Path to your AI Game Master directory. Defaults to `~/AIGameMaster`. |
| `AIGM_BRIDGE_PATH` | No | Path to `bridge.py` for the AI GM feature. |

---

## Opening Ports

### OS Firewall (UFW)

The installer opens the required ports automatically if UFW is active. To open them manually:

```bash
sudo ufw allow 8000/tcp   # SITREP panel
sudo ufw allow 2001/udp   # Arma game traffic
sudo ufw allow 17777/udp  # Arma server browser / query
sudo ufw allow 19999/tcp  # RCON
sudo ufw reload
```

### Router Port Forwarding

To make your server reachable from the internet, forward these ports on your router to your server's **local IP address**:

| Port | Protocol | Purpose |
|------|----------|---------|
| 2001 | UDP | Arma Reforger — game traffic |
| 17777 | UDP | Arma Reforger — server browser / Steam query |
| 19999 | TCP | RCON (optional — only if you need remote RCON access) |
| 8000 | TCP | SITREP panel (optional — only if you want remote panel access) |

**How to forward ports (general steps):**
1. Find your router's admin page — usually `http://192.168.1.1` or `http://192.168.0.1` in your browser
2. Log in (check the label on your router for the default credentials)
3. Find **Port Forwarding** — sometimes listed under Advanced, NAT, or Firewall
4. Add a rule for each port: set the internal IP to your server's local IP (e.g. `192.168.1.50`), the external and internal port to the same number, and the protocol as shown
5. Save and apply

Find your server's local IP:
```bash
hostname -I | awk '{print $1}'
```

> **Tip:** Assign your server a static local IP in your router's DHCP settings so the forwarding rules don't break after a reboot.

---

## Discord Login (Optional)

Users can sign in with Discord instead of a username and password. Their Discord account must be linked to a panel user by an owner first.

### Step 1 — Create a Discord application

1. Go to **https://discord.com/developers/applications**
2. Click **New Application** and give it a name (e.g. `My SITREP Panel`)
3. Go to **OAuth2 → General**
4. Copy your **Client ID** and **Client Secret**
5. Under **Redirects**, add:
   ```
   http://YOUR_SERVER_IP:8000/api/auth/discord/callback
   ```
   Replace with your actual `PANEL_URL` — must match exactly.

### Step 2 — Add credentials to the panel

In the panel go to **Settings → Discord** and enter:
- **Client ID** — from your Discord application
- **Client Secret** — from your Discord application
- **Redirect URI** — `http://YOUR_SERVER_IP:8000/api/auth/discord/callback`

Save. The Discord login button will appear on the login page immediately.

### Step 3 — Link Discord accounts to panel users

As an owner, go to **Settings → Users**, click a user, and use **Link Discord** to associate their Discord account. They can then log in with the Discord button.

> Users without a linked Discord account will see an error if they try to use Discord login.

---

## AI Game Master (Optional)

The AI GM tab lets an LLM autonomously manage the Game Master role — spawning enemies, reacting to players, and adjusting difficulty in real time. It requires a separate bridge process and a compatible Arma Reforger mod.

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| NVIDIA GPU | 8 GB VRAM minimum; 16 GB+ recommended |
| Ollama | Local LLM inference engine |
| Command&Control mod | Workshop mod ID `68E44E4AE677D389` — add to your server |

### Step 1 — Add the Command&Control mod to your Arma server

Search the Arma Reforger Workshop for **Command&Control** (mod ID `68E44E4AE677D389`) and add it to your server's mod list via the Mods tab in the panel.

This mod provides the in-game component that connects the running scenario to the AI bridge.

### Step 2 — Install the AI GM bridge

```bash
git clone https://github.com/gaz8157/AIGameMaster.git ~/AIGameMaster
cd ~/AIGameMaster
bash install.sh
```

The installer will:
1. Install Ollama and pull the recommended model for your GPU
2. Create `~/AIGameMaster/AIGameMaster/.env` from the template
3. Register `aigm-bridge` as a systemd service

### Step 3 — Configure the bridge

```bash
nano ~/AIGameMaster/AIGameMaster/.env
```

Set your Arma server's RCON details:
```
RCON_HOST=127.0.0.1
RCON_PORT=19999
RCON_PASSWORD=your_rcon_password
```

### Step 4 — Link the panel to the bridge

Add to `/opt/panel/.env`:
```
AIGM_DIR=/home/YOUR_USERNAME/AIGameMaster
AIGM_BRIDGE_PATH=/home/YOUR_USERNAME/AIGameMaster/AIGameMaster/bridge.py
```

Then restart the panel:
```bash
sudo systemctl restart sitrep-api
```

### Step 5 — Start the bridge

```bash
sudo systemctl start aigm-bridge
```

The **AI Game Master** tab in the panel will show **ONLINE** once the bridge is running and connected.

---

## Player Tracker (Optional)

The Tracker tab shows live player positions, 8/10-digit MGRS grid references, After-Action Review (AAR) replay data, and a feed compatible with ATAK and Mercury Enable for real-time blue-force tracking. It requires one server-side Arma Reforger mod — no relay process needed. The mod posts directly to the panel's ingest endpoints.

The tab is hidden by default. It only appears for owner / head_admin / admin accounts, and only while the mod is actively reporting (disappears within 90 seconds of the mod going silent or the server restarting).

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| PlayerTracker mod | Workshop mod ID `691608368426C1F2` — add to your server |

### Step 1 — Add the PlayerTracker mod to your Arma server

Search the Arma Reforger Workshop for **PlayerTracker** (mod ID `691608368426C1F2`) and add it to your server's mod list via the **Mods** tab in the panel, then restart the server.

### Step 2 — Generate an API key

In the panel go to **Tracker → Settings → Receiver** and click **Rotate key**. Copy the key that appears.

Alternatively, add it manually to `/opt/panel/.env` and restart:
```
PLAYERTRACKER_API_KEY=your_random_key_here
```

### Step 3 — Set the key in Workbench

Open your scenario in Arma Reforger Workbench, select the game mode entity, and find the **PlayerTrackerComponent** attributes. Set:
- **Webhook base URL** — `http://YOUR_SERVER_IP:8000/` (trailing slash required)
- **API key** — the key you generated in Step 2

The mod will begin POSTing player snapshots every 10 seconds (configurable) and instant events on kills, joins, and spawns.

### Step 4 — Verify

The **Tracker** tab will appear in the sidebar within 8 seconds of the first successful POST. Check the status endpoint if it doesn't show up:
```bash
curl http://localhost:8000/api/tracker/status
```
`wired_up: true` confirms the panel is receiving data.

---

## System Tab (Owner Only)

The **System** tab (bottom of the sidebar, owner accounts only) runs 10 health checks every 15 seconds and displays a traffic-light status for your installation:

| Check | What it verifies |
|-------|-----------------|
| `sudoers_file` | `/etc/sudoers.d/sitrep` exists |
| `sudo_systemctl` | `sudo -n` permission for `/bin/systemctl` |
| `sudo_tee` | `sudo -n` permission for `/usr/bin/tee` |
| `sudo_rm` | `sudo -n` permission for `rm -f` |
| `sudo_ufw` | `sudo -n` permission for `ufw status` |
| `arma_binary` | `/opt/arma-server/ArmaReforgerServer` exists |
| `systemd_dir` | `/etc/systemd/system` is present |
| `disk_space` | ≥ 1 GB free on `/opt` (warn < 5 GB) |
| `data_writable` | `backend/data/` directory is writable |
| `uv_lock` | `uv.lock` is not older than `pyproject.toml` |

Each failing check shows a **fix:** hint with a copy button. All checks currently point to the one-shot updater:

```bash
sudo /opt/panel/scripts/update.sh
```

The same data is available as JSON at `GET /api/system/diagnostics` (owner token required).

---

## Managing the Panel

```bash
# Status
sudo systemctl status sitrep-api

# Live logs
journalctl -u sitrep-api -f

# Restart
sudo systemctl restart sitrep-api

# Stop / Start
sudo systemctl stop sitrep-api
sudo systemctl start sitrep-api
```

---

## Updating

### One-shot updater (recommended)

```bash
sudo /opt/panel/scripts/update.sh
```

This script:
1. `git fetch` → hard-reset to `origin/<branch>` (safe even after force-pushed history)
2. Refreshes `/etc/sudoers.d/sitrep` via `scripts/bootstrap-sudoers.sh`
3. `uv sync` — replays `backend/uv.lock` exactly, no surprise dep upgrades
4. `npm ci && npm run build` — rebuilds the frontend
5. Restarts `sitrep-api`

After it finishes, the **System** tab will confirm all checks are green.

### Manual update

```bash
cd /opt/panel
git pull
cd backend && uv sync --frozen && cd ..
cd frontend && npm ci && npm run build && cd ..
sudo systemctl restart sitrep-api
```

### Update the Arma Reforger server

```bash
/usr/games/steamcmd +force_install_dir /opt/arma-server +login anonymous +app_update 1874900 +quit
```

---

## WSL Setup

Windows users can run the panel inside WSL 2:

1. **Enable WSL 2** — open PowerShell as Administrator and run:
   ```powershell
   wsl --install
   ```
   Reboot when prompted, then open **Ubuntu** from the Start Menu.

2. **Enable systemd** — inside Ubuntu, run:
   ```bash
   echo -e "[boot]\nsystemd=true" | sudo tee /etc/wsl.conf
   ```
   Then in PowerShell: `wsl --shutdown`, and reopen Ubuntu.

3. **Run the installer** inside Ubuntu:
   ```bash
   curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
   ```

4. **Access the panel** from your Windows browser at `http://localhost:8000`

> GPU stats require NVIDIA CUDA on WSL setup. The panel works without it but GPU fields will show zero.

### Starting the panel on Windows

The panel service starts automatically whenever WSL boots — you don't need to do anything after a reboot.

To launch it quickly from Windows, create a shortcut on your desktop:

1. Right-click the desktop → **New → Shortcut**
2. Paste this as the location:
   ```
   cmd.exe /c "wsl sudo systemctl start sitrep-api && start http://localhost:8000"
   ```
3. Name it **SITREP** and click Finish

Double-clicking the shortcut will start WSL, ensure the panel is running, and open it in your browser.

---

## Uninstall

### Panel only

```bash
sudo systemctl disable --now sitrep-api sitrep-web 2>/dev/null
sudo rm -f /etc/systemd/system/sitrep-api.service
sudo rm -f /etc/sudoers.d/sitrep
sudo systemctl daemon-reload
sudo rm -rf /opt/panel
```

### Complete purge — everything (panel + Arma server + optional services)

Run this to remove every file installed by SITREP and the Arma Reforger server in one pass:

```bash
# Stop and remove all SITREP services
sudo systemctl disable --now sitrep-api sitrep-web sitrep-tracker 2>/dev/null
sudo rm -f /etc/systemd/system/sitrep-api.service
sudo rm -f /etc/systemd/system/sitrep-web.service
sudo rm -f /etc/systemd/system/sitrep-tracker.service

# Stop and remove AI GM bridge
sudo systemctl disable --now aigm-bridge 2>/dev/null
sudo rm -f /etc/systemd/system/aigm-bridge.service

# Stop and remove Arma Reforger server
sudo systemctl disable --now arma-reforger 2>/dev/null
sudo rm -f /etc/systemd/system/arma-reforger.service
sudo rm -f /etc/systemd/system/arma-reforger-probe.service 2>/dev/null
sudo rm -rf /opt/arma-server

# Remove panel and sudoers rule
sudo rm -f /etc/sudoers.d/sitrep
sudo rm -rf /opt/panel

# Reload systemd
sudo systemctl daemon-reload

# Optional — remove AIGameMaster and PlayerTracker clones
# rm -rf ~/AIGameMaster ~/PlayerTracker
```

After a purge, re-install from scratch with the one-liner:

```bash
curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
```

---

## Troubleshooting

**Panel won't start**
```bash
journalctl -u sitrep-api -n 50 --no-pager
```

**"Backend unreachable" in browser**
- Check the service is running: `sudo systemctl status sitrep-api`
- Check the firewall: `sudo ufw allow 8000/tcp` (the installer does this automatically if UFW is active)
- If accessing from outside your network, make sure port 8000 is forwarded on your router — see [Opening Ports](#opening-ports)

**Can't start/stop the Arma server**
- Verify the service exists: `sudo systemctl status arma-reforger`
- Check the sudoers rule: `sudo cat /etc/sudoers.d/sitrep`

**Arma server won't download during install**
- Run SteamCMD manually:
  ```bash
  sudo -u YOUR_USERNAME /usr/games/steamcmd +force_install_dir /opt/arma-server +login anonymous +app_update 1874900 validate +quit
  ```

**Startup diagnostics shows broken mods**
- Go to **Startup → Diagnostics** tab — broken mods are listed with a remove button

**GPU stats show 0 or are missing**
- Verify `nvidia-smi` works: `nvidia-smi -q`
- The panel falls back gracefully if no GPU is detected

**Locked out — forgot password / can't log in**

Reset the owner account password from the command line (you will be prompted for your system password):
```bash
sudo -v && cd /opt/panel/backend && .venv/bin/python3 -c "import json,hashlib,secrets;f='data/panel_users.json';d=json.load(open(f));u=next(x for x in d['users'] if x.get('role')=='owner');s=secrets.token_hex(16);h=hashlib.pbkdf2_hmac('sha256',b'admin123',s.encode(),100000).hex();u['password_hash']=s+':'+h;u.pop('salt',None);json.dump(d,open(f,'w'),indent=2);print('Reset',u['username'],'to admin123')"
```
Then log in with your owner username and `admin123`, and change your password in Settings.

To avoid lockouts in future, add a recovery email in **Settings → Security** — the login page has a "Forgot password?" link that sends a reset email (requires SMTP configured in `.env`).

---

## License

MIT
