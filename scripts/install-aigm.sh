#!/usr/bin/env bash
# SITREP — AI Game Master optional module installer
# Usage: sudo bash /opt/panel/scripts/install-aigm.sh
#
# Installs the AI GM bridge from the copy bundled with the panel at
# /opt/panel/tools/aigm/. The raw inner installer lives at
# /opt/panel/tools/aigm/install.sh — this script wraps it with sudo
# handling, user detection, panel .env wiring, and service restart.
set -euo pipefail

PANEL_DIR="/opt/panel"
AIGM_TOOLS_DIR="$PANEL_DIR/tools/aigm"
AIGM_INNER_INSTALLER="$AIGM_TOOLS_DIR/install.sh"
PANEL_ENV="$PANEL_DIR/.env"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[AI GM]${NC} $*"; }
success() { echo -e "${GREEN}[AI GM]${NC} $*"; }
warn()    { echo -e "${YELLOW}[AI GM]${NC} $*"; }
die()     { echo -e "${RED}[AI GM] ERROR:${NC} $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
    die "Run with sudo: sudo bash $0"
fi

# Detect the real non-root user
if [[ -n "${SUDO_USER:-}" ]]; then
    SERVICE_USER="$SUDO_USER"
elif id -u 1000 &>/dev/null; then
    SERVICE_USER="$(id -un 1000)"
else
    die "Could not determine service user. Run with sudo from your normal user account."
fi
USER_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
info "Installing as user: $SERVICE_USER"

# ── Sanity check ─────────────────────────────────────────────────────────────
if [[ ! -f "$AIGM_INNER_INSTALLER" ]]; then
    die "Bundled installer not found at $AIGM_INNER_INSTALLER — is the panel up to date?"
fi

if [[ ! -f "$AIGM_TOOLS_DIR/AIGameMaster/bridge.py" ]]; then
    die "bridge.py not found at $AIGM_TOOLS_DIR/AIGameMaster/bridge.py — panel tools/ dir may be incomplete."
fi

# ── Run inner installer as the service user ───────────────────────────────────
info "Running AI GM installer from bundled tools..."
export USER="$SERVICE_USER"
export HOME="$USER_HOME"
sudo -u "$SERVICE_USER" bash "$AIGM_INNER_INSTALLER"

# ── Wire up panel .env ────────────────────────────────────────────────────────
AIGM_BRIDGE_PATH="$AIGM_TOOLS_DIR/AIGameMaster/bridge.py"
if [[ -f "$PANEL_ENV" ]]; then
    if grep -q "^AIGM_BRIDGE_PATH=" "$PANEL_ENV"; then
        sed -i "s|^AIGM_BRIDGE_PATH=.*|AIGM_BRIDGE_PATH=$AIGM_BRIDGE_PATH|" "$PANEL_ENV"
    else
        echo "AIGM_BRIDGE_PATH=$AIGM_BRIDGE_PATH" >> "$PANEL_ENV"
    fi
    success "Panel .env updated with AIGM_BRIDGE_PATH=$AIGM_BRIDGE_PATH"
fi

# Restart panel so it picks up the new bridge path
if systemctl is-active --quiet sitrep-api 2>/dev/null; then
    systemctl restart sitrep-api
    success "Panel restarted"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  AI Game Master installed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}1. Edit RCON password:${NC}  $AIGM_TOOLS_DIR/AIGameMaster/.env"
echo -e "  ${BOLD}2. Start the bridge:${NC}    sudo systemctl start aigm-bridge"
echo -e "  ${BOLD}3. Reload the panel${NC} — the AI GM tab appears automatically"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Logs:    ${CYAN}journalctl -u aigm-bridge -f${NC}"
echo -e "  Restart: ${CYAN}sudo systemctl restart aigm-bridge${NC}"
echo -e "  Update:  ${CYAN}sudo bash $0${NC}"
echo ""
