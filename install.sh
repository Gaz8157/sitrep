#!/usr/bin/env bash
# SITREP Panel — Installer
# Usage: curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
# Or:    sudo bash install.sh
set -euo pipefail

REPO="https://github.com/gaz8157/sitrep.git"
INSTALL_DIR="${SITREP_INSTALL_DIR:-/opt/panel}"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[SITREP]${NC} $*"; }
success() { echo -e "${GREEN}[SITREP]${NC} $*"; }
warn()    { echo -e "${YELLOW}[SITREP]${NC} $*"; }
die()     { echo -e "${RED}[SITREP] ERROR:${NC} $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
    die "Run with sudo: sudo bash install.sh"
fi

# Detect the real non-root user for service ownership
if [[ -n "${SUDO_USER:-}" ]]; then
    SERVICE_USER="$SUDO_USER"
elif id -u 1000 &>/dev/null; then
    SERVICE_USER="$(id -un 1000)"
else
    die "Could not determine service user. Run with sudo from your normal user account."
fi
info "Service will run as: $SERVICE_USER"

# ── OS check ─────────────────────────────────────────────────────────────────
if [[ ! -f /etc/os-release ]]; then
    die "Cannot detect OS. SITREP requires Ubuntu 22.04 or later."
fi
# shellcheck source=/dev/null
source /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
    die "SITREP requires Ubuntu. Detected: $PRETTY_NAME"
fi
VER_MAJOR=$(echo "$VERSION_ID" | cut -d. -f1)
if [[ "$VER_MAJOR" -lt 22 ]]; then
    die "Ubuntu 22.04 or later required. Detected: $PRETTY_NAME"
fi
info "OS: $PRETTY_NAME"

# ── WSL detection ─────────────────────────────────────────────────────────────
IS_WSL=false
if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=true
    warn "WSL environment detected."
    if ! systemctl is-system-running --quiet 2>/dev/null; then
        echo ""
        warn "systemd is not enabled in your WSL instance."
        echo -e "  Add to ${BOLD}/etc/wsl.conf${NC}:"
        echo -e "  ${CYAN}[boot]${NC}"
        echo -e "  ${CYAN}systemd=true${NC}"
        echo ""
        echo -e "  Then run ${BOLD}wsl --shutdown${NC} in PowerShell and reopen Ubuntu."
        die "Enable systemd and re-run the installer."
    fi
    info "WSL systemd running"
fi

# ── System dependencies ───────────────────────────────────────────────────────
info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git curl python3

# Node.js 20 via NodeSource (Ubuntu ships an older version)
NODE_OK=false
if command -v node &>/dev/null; then
    NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")
    [[ "$NODE_VER" -ge 18 ]] && NODE_OK=true
fi
if [[ "$NODE_OK" == "false" ]]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
fi
info "Node $(node --version), npm $(npm --version)"

# SteamCMD
STEAMCMD="/usr/games/steamcmd"
if ! command -v steamcmd &>/dev/null && [[ ! -f "$STEAMCMD" ]]; then
    info "Installing SteamCMD..."
    add-apt-repository multiverse -y >/dev/null 2>&1
    dpkg --add-architecture i386
    apt-get update -qq
    echo "steamcmd steam/question select I AGREE" | debconf-set-selections
    echo "steamcmd steam/license note ''" | debconf-set-selections
    apt-get install -y -qq steamcmd
    success "SteamCMD installed"
fi
# Resolve actual steamcmd binary path
if [[ ! -f "$STEAMCMD" ]] && command -v steamcmd &>/dev/null; then
    STEAMCMD="$(command -v steamcmd)"
fi
[[ -f "$STEAMCMD" ]] || die "SteamCMD not found after install. Check logs above."

# ── Arma Reforger dedicated server ───────────────────────────────────────────
ARMA_DIR="/opt/arma-server"
ARMA_SERVICE="arma-reforger"

mkdir -p "$ARMA_DIR"
chown "$SERVICE_USER":"$SERVICE_USER" "$ARMA_DIR"

# SteamCMD self-updates on its very first run on a new system, which can cause
# a "Missing configuration" error if you immediately request an app download.
# Running +quit first lets it finish initializing before we ask it to do work.
info "Initializing SteamCMD (first-run update)..."
sudo -u "$SERVICE_USER" "$STEAMCMD" +login anonymous +quit >/dev/null 2>&1 || true

info "Installing / updating Arma Reforger dedicated server (this may take a while)..."
ARMA_INSTALLED=false
for attempt in 1 2 3; do
    sudo -u "$SERVICE_USER" "$STEAMCMD" \
        +force_install_dir "$ARMA_DIR" \
        +login anonymous \
        +app_update 1874900 \
        +quit || true
    if [[ -f "$ARMA_DIR/ArmaReforgerServer" ]]; then
        ARMA_INSTALLED=true
        break
    fi
    warn "SteamCMD attempt $attempt did not complete, retrying in 5s..."
    sleep 5
done

if [[ "$ARMA_INSTALLED" == "true" ]]; then
    success "Arma Reforger server ready at $ARMA_DIR"
else
    warn "Could not download Arma Reforger server automatically."
    warn "Run this manually after the installer finishes:"
    warn "  sudo -u $SERVICE_USER $STEAMCMD +force_install_dir $ARMA_DIR +login anonymous +app_update 1874900 validate +quit"
fi

# Create profile and log directories
sudo -u "$SERVICE_USER" mkdir -p \
    "$ARMA_DIR/profile/logs" \
    "$ARMA_DIR/profile/addons"

# Write a starter config.json if one doesn't exist
if [[ ! -f "$ARMA_DIR/config.json" ]]; then
    info "Creating default server config..."
    RCON_PASSWORD="$(openssl rand -base64 24 2>/dev/null | tr -d '\n+/=' | head -c 24)"
    if [[ -z "$RCON_PASSWORD" ]]; then
        RCON_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '\n+/=' | head -c 24)"
    fi
    sudo -u "$SERVICE_USER" tee "$ARMA_DIR/config.json" > /dev/null << ARMACFG
{
  "bindAddress": "",
  "bindPort": 2001,
  "publicAddress": "",
  "publicPort": 2001,
  "game": {
    "name": "My Arma Server",
    "password": "",
    "passwordAdmin": "",
    "scenarioId": "{59AD59368755F41A}Missions/21_GM_Eden.conf",
    "maxPlayers": 64,
    "visible": true,
    "crossPlatform": true,
    "gameProperties": {
      "serverMaxViewDistance": 1600,
      "networkViewDistance": 500,
      "disableThirdPerson": false,
      "battlEye": true,
      "persistence": {
        "autoSaveInterval": 5,
        "hiveId": 0
      }
    }
  },
  "operating": {
    "lobbyPlayerSynchronise": true,
    "playerSaveTime": 120,
    "aiLimit": -1,
    "disableAI": false
  },
  "rcon": {
    "address": "127.0.0.1",
    "port": 19999,
    "password": "${RCON_PASSWORD}",
    "permission": "admin",
    "maxClients": 16
  }
}
ARMACFG
    success "Default config.json created (RCON password randomized)"
fi

# Create the arma-reforger systemd service if it doesn't exist
if [[ ! -f "/etc/systemd/system/${ARMA_SERVICE}.service" ]]; then
    info "Creating arma-reforger systemd service..."
    cat > "/etc/systemd/system/${ARMA_SERVICE}.service" << EOF
[Unit]
Description=Arma Reforger Dedicated Server
After=network.target

[Service]
User=${SERVICE_USER}
WorkingDirectory=${ARMA_DIR}
ExecStart=${ARMA_DIR}/ArmaReforgerServer -config ${ARMA_DIR}/config.json -profile ${ARMA_DIR}/profile
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable "$ARMA_SERVICE"
    success "arma-reforger service created (start it from the panel)"
fi

# ── Clone / update ────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing install at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only
else
    info "Installing SITREP to $INSTALL_DIR..."
    git clone "$REPO" "$INSTALL_DIR"
fi

# ── uv (Python package + project manager) ───────────────────────────────────
UV_BIN=""
if [[ -x /usr/local/bin/uv ]]; then
    UV_BIN=/usr/local/bin/uv
elif command -v uv &>/dev/null; then
    UV_BIN="$(command -v uv)"
fi
if [[ -z "$UV_BIN" ]]; then
    info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | \
        env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh >/dev/null 2>&1
    UV_BIN=/usr/local/bin/uv
fi
[[ -x "$UV_BIN" ]] || die "uv install failed — see https://docs.astral.sh/uv/"
info "uv: $("$UV_BIN" --version)"

# ── Python environment (uv) ──────────────────────────────────────────────────
info "Setting up Python environment with uv..."
# Migrate away from the legacy pip venv if a previous installer created it
if [[ -d "$INSTALL_DIR/backend/venv" ]]; then
    rm -rf "$INSTALL_DIR/backend/venv"
    info "Removed legacy backend/venv/ (pre-uv install)"
fi
# Service user owns the backend tree so .venv/ belongs to them
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/backend"
# uv auto-fetches a matching Python (pyproject pins ==3.12.*) if the host has none
(cd "$INSTALL_DIR/backend" && sudo -Hu "$SERVICE_USER" "$UV_BIN" sync --frozen)
success "Python environment ready (.venv via uv)"

# ── Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
cd "$INSTALL_DIR/frontend"
npm ci --silent
npm run build --silent
cd "$INSTALL_DIR"
success "Frontend built"

# ── Environment config ────────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    [[ -z "$LOCAL_IP" ]] && LOCAL_IP="localhost"
    DEFAULT_URL="http://${LOCAL_IP}:8000"
    [[ "$IS_WSL" == "true" ]] && DEFAULT_URL="http://localhost:8000"

    # On WSL, piped installs (curl | bash) have no interactive terminal —
    # auto-accept the default instead of hanging on a read prompt.
    if [[ "$IS_WSL" == "true" ]] || ! [ -t 0 ]; then
        PANEL_URL="$DEFAULT_URL"
        info "PANEL_URL set to: $PANEL_URL"
        info "To change it: edit $INSTALL_DIR/.env and run: sudo systemctl restart sitrep-api"
    else
        echo ""
        info "Set your panel URL (how users will access it):"
        echo -e "  ${BOLD}Local network:${NC}  http://${LOCAL_IP}:8000"
        echo -e "  ${BOLD}With domain:${NC}    https://panel.yourdomain.com"
        echo ""
        read -rp "PANEL_URL [$DEFAULT_URL]: " PANEL_URL
        PANEL_URL="${PANEL_URL:-$DEFAULT_URL}"
    fi
    # Generate a random PlayerTracker mod auth key. Localhost mod POSTs bypass
    # the check, but remote mods (e.g. Arma server on a different box than the
    # panel) need this to match between .env and the mod config. Auto-gen here
    # means fresh installs work for both cases without a manual rotation step.
    TRACKER_KEY="$(openssl rand -base64 33 2>/dev/null | tr -d '\n+/=' | head -c 43)"
    if [[ -z "$TRACKER_KEY" ]]; then
        TRACKER_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '\n+/=' | head -c 43)"
    fi
    printf 'PANEL_URL=%s\nPANEL_INSTALL_DIR=%s\nPLAYERTRACKER_API_KEY=%s\n' \
        "$PANEL_URL" "$INSTALL_DIR" "$TRACKER_KEY" > "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
    success ".env created (PANEL_URL + auto-generated PLAYERTRACKER_API_KEY)"
fi

# ── Permissions ───────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/backend/data"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# ── Sudoers (delegated to scripts/bootstrap-sudoers.sh) ─────────────────────
# Keeping the rule in one place means scripts/update.sh can refresh it on
# existing boxes without re-running the full installer.
if [[ -x "$INSTALL_DIR/scripts/bootstrap-sudoers.sh" ]]; then
    bash "$INSTALL_DIR/scripts/bootstrap-sudoers.sh" "$SERVICE_USER"
else
    warn "scripts/bootstrap-sudoers.sh missing — aborting"
    exit 1
fi

# ── Systemd service ───────────────────────────────────────────────────────────
info "Creating systemd service..."
cat > /etc/systemd/system/sitrep-api.service << EOF
[Unit]
Description=SITREP Panel
After=network.target

[Service]
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=-${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl disable --now sitrep-web 2>/dev/null || true
systemctl daemon-reload
systemctl enable sitrep-api
systemctl restart sitrep-api
sleep 3

# ── Firewall (UFW) ────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    if ufw status 2>/dev/null | grep -q "Status: active"; then
        info "Opening firewall ports..."
        ufw allow 8000/tcp  comment 'SITREP Panel'   >/dev/null
        ufw allow 2001/udp  comment 'Arma Reforger game' >/dev/null
        ufw allow 17777/udp comment 'Arma Reforger query' >/dev/null
        ufw allow 19999/tcp comment 'Arma Reforger RCON'  >/dev/null
        success "UFW: opened ports 8000 (panel), 2001/17777 (game), 19999 (RCON)"
    else
        info "UFW not active — skipping firewall rules"
        info "If you enable UFW later, open these ports:"
        info "  sudo ufw allow 8000/tcp 2001/udp 17777/udp 19999/tcp"
    fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
PANEL_URL_DISPLAY=$(grep '^PANEL_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  SITREP installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}Open in browser:${NC}  $PANEL_URL_DISPLAY"
echo -e "  ${BOLD}First launch:${NC}     Complete setup wizard to create your account"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Logs:    ${CYAN}journalctl -u sitrep-api -f${NC}"
echo -e "  Restart: ${CYAN}sudo systemctl restart sitrep-api${NC}"
echo -e "  Update:  ${CYAN}sudo $INSTALL_DIR/scripts/update.sh${NC}"
echo ""
