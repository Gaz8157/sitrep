#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="player-tracker"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
VENV="$SCRIPT_DIR/.venv"

echo "=== PlayerTracker Relay — Installer ==="

# Python check
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found." >&2
  exit 1
fi

# Virtual env
if [ ! -d "$VENV" ]; then
  echo "Creating virtualenv..."
  python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"

echo "Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r "$SCRIPT_DIR/requirements.txt"

# Config reminder
echo ""
echo "IMPORTANT: Edit $SCRIPT_DIR/config.json before starting:"
echo "  api_key           — set a strong shared secret"
echo "  mercury_webhook_url — set your Mercury Enable ATAK webhook URL (or leave blank)"
echo ""

# pytest.ini so pytest-asyncio works
if [ ! -f "$SCRIPT_DIR/pytest.ini" ]; then
  cat > "$SCRIPT_DIR/pytest.ini" <<'PYINI'
[pytest]
asyncio_mode = auto
PYINI
fi

# systemd service
PANEL_USER=$(id -un)
cat > /tmp/${SERVICE_NAME}.service <<EOF
[Unit]
Description=PlayerTracker Relay
After=network.target

[Service]
Type=simple
User=${PANEL_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${VENV}/bin/python ${SCRIPT_DIR}/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

if sudo cp /tmp/${SERVICE_NAME}.service "$SERVICE_FILE"; then
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  echo "Service installed: $SERVICE_NAME"
  echo "  Start with: sudo systemctl start $SERVICE_NAME"
  echo "  Status:     sudo systemctl status $SERVICE_NAME"
else
  echo "WARNING: Could not install systemd service (sudo required)."
  echo "  Start manually: cd $SCRIPT_DIR && $VENV/bin/python server.py"
fi

echo ""
echo "=== PlayerTracker Relay install complete ==="
