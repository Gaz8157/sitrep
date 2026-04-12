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

# Print setup instructions
PANEL_URL=$(grep "^PANEL_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "http://YOUR_SERVER_IP:8000")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Player Tracker ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}API key:${NC}  ${CYAN}${TRACKER_KEY}${NC}"
echo ""
echo -e "  ${BOLD}Arma Reforger Workbench setup:${NC}"
echo -e "  1. Add Workshop mod ${BOLD}691608368426C1F2${NC} to your server's mod list"
echo -e "  2. Open your scenario, select the game mode entity"
echo -e "  3. Find the ${BOLD}PlayerTrackerComponent${NC} attributes and set:"
echo -e "     ${BOLD}Webhook base URL:${NC}  ${PANEL_URL}/"
echo -e "     ${BOLD}API key:${NC}           ${TRACKER_KEY}"
echo -e "  4. Save and restart the Arma server"
echo ""
echo -e "  The ${BOLD}Tracker${NC} tab will appear in the panel sidebar"
echo -e "  within 8 seconds of the first mod POST."
echo ""
echo -e "  Verify: ${CYAN}curl http://localhost:8000/api/tracker/status${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
