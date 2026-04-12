#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[Tracker]${NC} $*"; }
success() { echo -e "${GREEN}[Tracker]${NC} $*"; }
warn()    { echo -e "${YELLOW}[Tracker]${NC} $*"; }
die()     { echo -e "${RED}[Tracker] ERROR:${NC} $*" >&2; exit 1; }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  SITREP Player Tracker — Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Locate the panel
PANEL_DIR="${PANEL_DIR:-}"
if [[ -z "$PANEL_DIR" ]]; then
    if [[ -f "/opt/panel/backend/main.py" ]]; then
        PANEL_DIR="/opt/panel"
    elif [[ -n "${PANEL_INSTALL_DIR:-}" && -f "$PANEL_INSTALL_DIR/backend/main.py" ]]; then
        PANEL_DIR="$PANEL_INSTALL_DIR"
    else
        die "SITREP panel not found. Set PANEL_DIR=/path/to/panel and re-run."
    fi
fi

ENV_FILE="$PANEL_DIR/.env"

[[ -f "$PANEL_DIR/backend/main.py" ]] || die "Panel not found at $PANEL_DIR"
[[ -f "$ENV_FILE" ]]                  || die ".env not found at $ENV_FILE — run the panel installer first."

info "Panel found at $PANEL_DIR"

# Check for existing key
EXISTING_KEY=$(grep "^PLAYERTRACKER_API_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
NEEDS_RESTART=false

if [[ -z "$EXISTING_KEY" ]]; then
    info "No PLAYERTRACKER_API_KEY found — generating one..."
    NEW_KEY="$(openssl rand -base64 33 2>/dev/null | tr -d '\n+/=' | head -c 43)"
    [[ -z "$NEW_KEY" ]] && NEW_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '\n+/=' | head -c 43)"
    echo "PLAYERTRACKER_API_KEY=$NEW_KEY" >> "$ENV_FILE"
    TRACKER_KEY="$NEW_KEY"
    NEEDS_RESTART=true
    success "API key generated and written to $ENV_FILE"
else
    TRACKER_KEY="$EXISTING_KEY"
    info "API key already set — keeping existing key."
fi

# Restart panel if key was just added
if [[ "$NEEDS_RESTART" == "true" ]]; then
    info "Restarting panel to apply new key..."
    if sudo systemctl restart sitrep-api 2>/dev/null; then
        success "Panel restarted."
    else
        warn "Could not restart panel automatically (needs sudo)."
        warn "Restart manually: sudo systemctl restart sitrep-api"
    fi
fi

# Verify panel is responding
sleep 1
STATUS=$(curl -sf http://localhost:8000/api/tracker/status 2>/dev/null || echo "unreachable")
if echo "$STATUS" | grep -q "wired_up"; then
    success "Panel tracker endpoint confirmed reachable."
else
    warn "Could not reach /api/tracker/status — panel may still be starting. Check with:"
    warn "  curl http://localhost:8000/api/tracker/status"
fi

# Read panel URL
PANEL_URL=$(grep "^PANEL_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "http://YOUR_SERVER_IP:8000")
PANEL_URL="${PANEL_URL%/}"

# ── Arma server profile path ────────────────────────────────────────────────
echo ""
info "Arma server profile path setup"
info "The mod reads \$profile:PlayerTracker/config.cfg to find your panel."
info "If your Arma server is on THIS machine, enter the profile path below."
info "If it's on a different machine, leave blank — you'll get a file to copy."
echo ""

# Check if a path was previously saved
SAVED_PROFILE=$(grep "^ARMA_PROFILE_PATH=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)

DEFAULT_HINT=""
if [[ -n "$SAVED_PROFILE" ]]; then
    DEFAULT_HINT=" [${SAVED_PROFILE}]"
fi

ARMA_PROFILE=""
if [ -t 0 ]; then
    read -rp "  Arma profile path${DEFAULT_HINT}: " ARMA_PROFILE
elif [ -e /dev/tty ]; then
    read -rp "  Arma profile path${DEFAULT_HINT}: " ARMA_PROFILE < /dev/tty
fi

ARMA_PROFILE="${ARMA_PROFILE:-$SAVED_PROFILE}"

CONFIG_WRITTEN=false

if [[ -n "$ARMA_PROFILE" ]]; then
    CONFIG_DIR="${ARMA_PROFILE%/}/PlayerTracker"
    CONFIG_FILE="$CONFIG_DIR/config.cfg"

    mkdir -p "$CONFIG_DIR" 2>/dev/null || true

    if [[ -d "$CONFIG_DIR" ]]; then
        cat > "$CONFIG_FILE" <<EOF
# PlayerTracker config — written by SITREP panel installer
# Trailing slash required on url
url=${PANEL_URL}/
api_key=${TRACKER_KEY}
EOF
        success "Config written to $CONFIG_FILE"
        CONFIG_WRITTEN=true

        # Save path to panel .env for future runs
        if ! grep -q "^ARMA_PROFILE_PATH=" "$ENV_FILE"; then
            echo "ARMA_PROFILE_PATH=${ARMA_PROFILE%/}" >> "$ENV_FILE"
        else
            sed -i "s|^ARMA_PROFILE_PATH=.*|ARMA_PROFILE_PATH=${ARMA_PROFILE%/}|" "$ENV_FILE"
        fi
    else
        warn "Could not create $CONFIG_DIR — check the path and permissions."
    fi
fi

# Print setup instructions
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Player Tracker ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}API key:${NC}  ${CYAN}${TRACKER_KEY}${NC}"
echo ""
echo -e "  ${BOLD}Step 1:${NC} Add Workshop mod ${BOLD}691608368426C1F2${NC} to your server's mod list"
echo ""

if [[ "$CONFIG_WRITTEN" == "true" ]]; then
    echo -e "  ${BOLD}Step 2:${NC} Config file written — no Workbench setup needed."
    echo -e "          The mod will read: ${CYAN}${CONFIG_FILE}${NC}"
else
    echo -e "  ${BOLD}Step 2:${NC} Drop this config file on your Arma server at:"
    echo -e "          ${CYAN}\$profile:PlayerTracker/config.cfg${NC}"
    echo ""
    echo -e "  ${BOLD}File contents:${NC}"
    echo -e "  ${CYAN}# PlayerTracker config"
    echo -e "  url=${PANEL_URL}/"
    echo -e "  api_key=${TRACKER_KEY}${NC}"
    echo ""
    echo -e "  ${BOLD}Or${NC} configure via Workbench (PlayerTrackerComponent attributes):"
    echo -e "     ${BOLD}Webhook base URL:${NC}  ${PANEL_URL}/"
    echo -e "     ${BOLD}API key:${NC}           ${TRACKER_KEY}"
fi

echo ""
echo -e "  ${BOLD}Step 3:${NC} Start your Arma server — the ${BOLD}Tracker${NC} tab appears in the"
echo -e "          panel sidebar within 8 seconds of the first mod POST."
echo ""
echo -e "  Verify: ${CYAN}curl http://localhost:8000/api/tracker/status${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
