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
- **AI Game Master** — optional AI GM tab (requires separate bridge setup)
- **Multi-server** — manage multiple Arma Reforger instances from one panel
- **Auth** — user accounts with roles: owner / head_admin / admin / moderator / viewer / demo
- **Setup wizard** — guided first-run setup to create your owner account
- **Themes** — Midnight, Daylight, Tactical, Ember
- **Mobile** — fully responsive, works on phone and tablet

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 22.04 or 24.04 | Other distros not supported |
| `sudo` access | Installer needs root to set up systemd |
| Arma Reforger dedicated server | Installed at `/opt/arma-server/` with systemd service `arma-reforger` |
| SteamCMD | For server updates — installer handles this automatically |
| NVIDIA GPU + `nvidia-smi` | Optional — for GPU stats in the dashboard |

> **Windows users:** Run the panel inside WSL 2 with Ubuntu. See [WSL Setup](#wsl-setup) below.

---

## Installation

### One-liner (recommended)

```bash
curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
```

The installer will:
1. Install system dependencies (Node.js 20, Python 3, SteamCMD)
2. Clone the panel to `/opt/panel`
3. Build the frontend and set up a Python environment
4. Prompt for your panel URL
5. Create a systemd service (`sitrep-api`) on port 8000
6. Start the panel

**Open your browser to the panel URL and complete the setup wizard to create your owner account.**

You can also set a custom install directory:
```bash
SITREP_INSTALL_DIR=/opt/myserver curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
```

### Manual install

```bash
# Clone
sudo git clone https://github.com/gaz8157/sitrep.git /opt/panel
cd /opt/panel

# Python environment
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt

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
ExecStart=/opt/panel/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
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

On first launch the **setup wizard** will appear — enter a username and password to create your owner account. This account has full control of the panel and can create additional users from the settings area.

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
| `AIGM_DIR` | No | Path to your AI Game Master directory. Defaults to `~/AIGameMaster`. |
| `AIGM_BRIDGE_PATH` | No | Path to `bridge.py` for the AI GM feature. |

---

## Arma Server Setup

The panel expects your Arma Reforger server at `/opt/arma-server/` controlled by a systemd service named `arma-reforger`.

**Install the server via SteamCMD:**
```bash
sudo mkdir -p /opt/arma-server
steamcmd +force_install_dir /opt/arma-server +login anonymous +app_update 1874900 validate +quit
```

**Create the systemd service** at `/etc/systemd/system/arma-reforger.service`:
```ini
[Unit]
Description=Arma Reforger Dedicated Server
After=network.target

[Service]
User=YOUR_USERNAME
WorkingDirectory=/opt/arma-server
ExecStart=/opt/arma-server/ArmaReforgerServer -config /opt/arma-server/config.json -profile /opt/arma-server/profile
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable arma-reforger
```

Then use the panel to configure mods, startup params, and start your server.

**Sudoers rule** (required for the panel to start/stop the server without a password prompt):
```bash
echo "YOUR_USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl" | sudo tee /etc/sudoers.d/sitrep
```

The installer adds this automatically.

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

```bash
cd /opt/panel
git pull
cd frontend && npm ci && npm run build && cd ..
sudo systemctl restart sitrep-api
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

---

## Uninstall

```bash
sudo systemctl disable --now sitrep-api
sudo rm /etc/systemd/system/sitrep-api.service
sudo rm /etc/sudoers.d/sitrep
sudo systemctl daemon-reload
sudo rm -rf /opt/panel
```

---

## Troubleshooting

**Panel won't start**
```bash
journalctl -u sitrep-api -n 50 --no-pager
```

**"Backend unreachable" in browser**
- Check the service: `sudo systemctl status sitrep-api`
- Open the firewall port: `sudo ufw allow 8000/tcp`

**Can't start/stop the Arma server**
- Verify the `arma-reforger` service exists: `sudo systemctl status arma-reforger`
- Check the sudoers rule: `sudo cat /etc/sudoers.d/sitrep`

**Startup diagnostics shows broken mods**
- Go to **Startup → Diagnostics** tab — broken mods are listed with a remove button

**GPU stats show 0 or are missing**
- Verify `nvidia-smi` works: `nvidia-smi -q`
- The panel falls back gracefully if no GPU is detected

---

## License

MIT
