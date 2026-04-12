#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$SCRIPT_DIR/AIGameMaster"
SERVICE_NAME="aigm-bridge"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
VENV="$BRIDGE_DIR/.venv"

echo "=== AI Game Master Bridge — Installer ==="

# Python check
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Install python3.10+ first." >&2
  exit 1
fi

PY=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
MAJOR=$(echo "$PY" | cut -d. -f1)
MINOR=$(echo "$PY" | cut -d. -f2)
if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 10 ]); then
  echo "ERROR: Python 3.10+ required (found $PY)." >&2
  exit 1
fi
echo "Python $PY OK"

# Virtual env
if [ ! -d "$VENV" ]; then
  echo "Creating virtualenv..."
  python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"

echo "Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r "$BRIDGE_DIR/requirements.txt"

# .env check
if [ ! -f "$BRIDGE_DIR/.env" ]; then
  cp "$BRIDGE_DIR/.env.example" "$BRIDGE_DIR/.env"
  echo ""
  echo "IMPORTANT: .env created from .env.example"
  echo "  Edit $BRIDGE_DIR/.env before starting the bridge."
  echo "  At minimum set: ARMA_RCON_PASSWORD"
  echo ""
fi

# Ollama check
OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11434}
if curl -sf "$OLLAMA_URL" > /dev/null 2>&1; then
  MODEL=$(grep "^OLLAMA_MODEL=" "$BRIDGE_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "qwen2.5:14b")
  MODEL=${MODEL:-qwen2.5:14b}
  echo "Ollama found. Pulling model: $MODEL (this may take several minutes)..."
  curl -sf -X POST "$OLLAMA_URL/api/pull" -d "{\"name\":\"$MODEL\"}" | tail -1 || true
else
  echo "WARNING: Ollama not reachable at $OLLAMA_URL"
  echo "  Install Ollama and pull your model before starting the bridge."
fi

# systemd service
PANEL_USER=$(id -un)
cat > /tmp/${SERVICE_NAME}.service <<EOF
[Unit]
Description=AI Game Master Bridge
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=${PANEL_USER}
WorkingDirectory=${BRIDGE_DIR}
EnvironmentFile=${BRIDGE_DIR}/.env
ExecStart=${VENV}/bin/python ${BRIDGE_DIR}/bridge.py
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
  echo "  Start manually: cd $BRIDGE_DIR && $VENV/bin/python bridge.py"
fi

echo ""
echo "=== AI GM Bridge install complete ==="
