#!/usr/bin/env bash
# SITREP Panel — Installer
# Usage: curl -sSL https://raw.githubusercontent.com/gaz8157/sitrep/main/install.sh | sudo bash
# Or:    sudo bash install.sh
set -euo pipefail

REPO="https://github.com/gaz8157/sitrep.git"
INSTALL_DIR="${SITREP_INSTALL_DIR:-/opt/panel}"
PYTHON="${PYTHON:-python3}"

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
apt-get install -y -qq git curl python3 python3-venv python3-pip

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
    sudo -u "$SERVICE_USER" tee "$ARMA_DIR/config.json" > /dev/null << 'ARMACFG'
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
    "password": "changeme",
    "permission": "admin",
    "maxClients": 16
  }
}
ARMACFG
    success "Default config.json created"
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

# ── Python venv ───────────────────────────────────────────────────────────────
info "Setting up Python environment..."
if [[ ! -d "$INSTALL_DIR/backend/venv" ]]; then
    $PYTHON -m venv "$INSTALL_DIR/backend/venv"
fi
"$INSTALL_DIR/backend/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/backend/venv/bin/pip" install -q -r "$INSTALL_DIR/backend/requirements.txt"
success "Python environment ready"

# ── Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
cd "$INSTALL_DIR/frontend"
npm ci --silent
npm run build --silent
cd "$INSTALL_DIR"
success "Frontend built"

# ── Environment config ────────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    DEFAULT_URL="http://${LOCAL_IP}:8000"
    [[ "$IS_WSL" == "true" ]] && DEFAULT_URL="http://localhost:8000"
    echo ""
    info "Set your panel URL (how users will access it):"
    echo -e "  ${BOLD}Local network:${NC}  http://${LOCAL_IP}:8000"
    echo -e "  ${BOLD}With domain:${NC}    https://panel.yourdomain.com"
    [[ "$IS_WSL" == "true" ]] && echo -e "  ${BOLD}WSL / Windows:${NC}  http://localhost:8000"
    echo ""
    read -rp "PANEL_URL [$DEFAULT_URL]: " PANEL_URL
    PANEL_URL="${PANEL_URL:-$DEFAULT_URL}"
    printf 'PANEL_URL=%s\nPANEL_INSTALL_DIR=%s\n' "$PANEL_URL" "$INSTALL_DIR" > "$INSTALL_DIR/.env"
    success ".env created"
fi

# ── Permissions ───────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/backend/data"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# ── Sudoers (server start/stop without password prompt) ──────────────────────
SUDOERS_FILE="/etc/sudoers.d/sitrep"
if [[ ! -f "$SUDOERS_FILE" ]]; then
    printf '%s ALL=(ALL) NOPASSWD: /bin/systemctl\n' "$SERVICE_USER" > "$SUDOERS_FILE"
    chmod 440 "$SUDOERS_FILE"
    success "Sudoers rule added"
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
ExecStart=${INSTALL_DIR}/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
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
echo -e "  Update:  ${CYAN}cd $INSTALL_DIR && git pull && cd frontend && npm ci && npm run build && cd .. && sudo systemctl restart sitrep-api${NC}"
echo ""
