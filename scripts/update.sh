#!/usr/bin/env bash
# update.sh — one-shot SITREP updater.
# Run with: sudo /opt/panel/scripts/update.sh
#
# Does what `git pull && uv sync && npm run build && systemctl restart` used to
# do, plus:
#   - Hard-resets to origin/<branch> so a force-pushed history doesn't brick
#     the update (the common case after a repo history rewrite).
#   - Re-runs bootstrap-sudoers.sh so new backend sudo calls stop failing on
#     existing boxes without needing to re-run the full installer.
#   - Preserves the panel's .env and any local data under backend/data/.

set -euo pipefail

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"; NC="\033[0m"
info()    { echo -e "${GREEN}[SITREP]${NC} $*"; }
warn()    { echo -e "${YELLOW}[SITREP]${NC} $*"; }
fail()    { echo -e "${RED}[SITREP]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run with sudo: sudo $0"

INSTALL_DIR="/opt/panel"
SERVICE_USER="${SUDO_USER:-$(stat -c '%U' "$INSTALL_DIR" 2>/dev/null || echo root)}"

[[ -d "$INSTALL_DIR/.git" ]] || fail "$INSTALL_DIR is not a git checkout"
id "$SERVICE_USER" >/dev/null 2>&1 || fail "service user $SERVICE_USER does not exist"

cd "$INSTALL_DIR"

info "Service user: $SERVICE_USER"

# ── 1. Git: fetch + hard reset to origin/<current branch> ────────────────────
BRANCH="$(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
    BRANCH="main"
    warn "Detached HEAD — resetting to main"
fi
info "Fetching origin..."
sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" fetch origin --prune

LOCAL="$(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse HEAD)"
REMOTE="$(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse "origin/$BRANCH")"
if [[ "$LOCAL" == "$REMOTE" ]]; then
    info "Already at origin/$BRANCH ($LOCAL)"
else
    info "Resetting $BRANCH: $LOCAL -> $REMOTE"
    sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
fi

# ── 2. Sudoers refresh ───────────────────────────────────────────────────────
if [[ -x "$INSTALL_DIR/scripts/bootstrap-sudoers.sh" ]]; then
    bash "$INSTALL_DIR/scripts/bootstrap-sudoers.sh" "$SERVICE_USER"
else
    warn "scripts/bootstrap-sudoers.sh missing — sudoers not refreshed"
fi

# ── 3. Python env ────────────────────────────────────────────────────────────
UV_BIN="$(sudo -u "$SERVICE_USER" bash -lc 'command -v uv || true')"
if [[ -z "$UV_BIN" ]]; then
    UV_BIN="/home/$SERVICE_USER/.local/bin/uv"
fi
if [[ ! -x "$UV_BIN" ]]; then
    fail "uv not found — re-run install.sh to reinstall uv"
fi
info "Syncing Python deps with $UV_BIN..."
sudo -u "$SERVICE_USER" bash -lc "cd $INSTALL_DIR/backend && $UV_BIN sync --frozen"

# ── 4. Frontend rebuild ──────────────────────────────────────────────────────
info "Building frontend..."
sudo -u "$SERVICE_USER" bash -lc "cd $INSTALL_DIR/frontend && npm ci --no-audit --no-fund && npm run build"

# ── 5. Restart ───────────────────────────────────────────────────────────────
info "Restarting sitrep-api..."
systemctl daemon-reload
systemctl restart sitrep-api
sleep 1
if systemctl is-active --quiet sitrep-api; then
    info "sitrep-api is running"
else
    warn "sitrep-api is NOT active — check: journalctl -u sitrep-api -n 50"
    exit 1
fi

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  SITREP update complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Branch:  $BRANCH @ $(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse --short HEAD)"
echo "  Health:  http://localhost:8000 → Admin → System Health"
echo "  Logs:    journalctl -u sitrep-api -f"
