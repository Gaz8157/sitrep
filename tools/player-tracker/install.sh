#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD_FILE="$SCRIPT_DIR/mod/PlayerTrackerComponent.c"

# ---------------------------------------------------------------------------
# Defaults — override via env or flags
# ---------------------------------------------------------------------------
ARMA_MODS_DIR="${ARMA_MODS_DIR:-/opt/arma-reforger/mods}"
PANEL_ENV="${PANEL_ENV:-/opt/panel/.env}"

usage() {
    echo "Usage: bash install.sh [--mods-dir /path/to/arma/mods] [--panel-env /path/to/.env]"
    echo ""
    echo "  --mods-dir    Path to the Arma Reforger mods directory (default: $ARMA_MODS_DIR)"
    echo "  --panel-env   Path to the SITREP panel .env file       (default: $PANEL_ENV)"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --mods-dir) ARMA_MODS_DIR="$2"; shift 2 ;;
        --panel-env) PANEL_ENV="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

echo "=== PlayerTracker Mod Installer ==="
echo ""

# ---------------------------------------------------------------------------
# Copy mod file
# ---------------------------------------------------------------------------
if [[ ! -d "$ARMA_MODS_DIR" ]]; then
    echo "ERROR: Mods directory not found: $ARMA_MODS_DIR"
    echo "  Set ARMA_MODS_DIR or pass --mods-dir"
    exit 1
fi

cp "$MOD_FILE" "$ARMA_MODS_DIR/PlayerTrackerComponent.c"
echo "[OK] PlayerTrackerComponent.c installed to $ARMA_MODS_DIR"

# ---------------------------------------------------------------------------
# Read API key from panel .env (if present)
# ---------------------------------------------------------------------------
API_KEY=""
if [[ -f "$PANEL_ENV" ]]; then
    API_KEY=$(grep -E '^PLAYERTRACKER_API_KEY=' "$PANEL_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

echo ""
echo "=== Workbench Configuration ==="
echo ""
echo "Open your scenario in Arma Reforger Workbench, add the PlayerTrackerComponent"
echo "to a game mode entity, then set:"
echo ""
if [[ -n "$API_KEY" ]]; then
    echo "  Webhook base URL : http://<panel-host>:8000/"
    echo "  API key          : $API_KEY"
else
    echo "  Webhook base URL : http://<panel-host>:8000/"
    echo "  API key          : (check PLAYERTRACKER_API_KEY in the panel .env)"
fi
echo ""
echo "The URL must end with a trailing slash."
echo "The API key is set under Settings > Tracker in the SITREP panel."
echo ""
echo "Done."
