#!/usr/bin/env bash
# bootstrap-sudoers.sh — single source of truth for /etc/sudoers.d/sitrep.
# Run as root. Accepts the panel service user as $1 (defaults to the invoking
# user when called directly). Idempotent — rewrites every run, validated with
# visudo before replacing the live file.
#
# Called from install.sh and scripts/update.sh. When the backend adds new
# sudo-requiring calls, extend ALLOWED_COMMANDS below and every re-run will
# refresh the rule on existing boxes.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: bootstrap-sudoers.sh must run as root" >&2
    exit 1
fi

SERVICE_USER="${1:-${SUDO_USER:-$(whoami)}}"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    echo "ERROR: user '$SERVICE_USER' does not exist" >&2
    exit 1
fi

SUDOERS_FILE="/etc/sudoers.d/sitrep"
SUDOERS_TMP="$(mktemp)"
trap 'rm -f "$SUDOERS_TMP"' EXIT

# Every command the backend invokes with sudo. Keep in sync with main.py.
cat > "$SUDOERS_TMP" <<SUDOEOF
# Managed by SITREP install.sh / scripts/bootstrap-sudoers.sh — do not hand-edit.
# Regenerated on every install/update so new backend sudo calls propagate.
${SERVICE_USER} ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/systemctl
${SERVICE_USER} ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/systemd/system/arma-reforger-*.service
${SERVICE_USER} ALL=(ALL) NOPASSWD: /usr/bin/rm -f /etc/systemd/system/arma-reforger-*.service
${SERVICE_USER} ALL=(ALL) NOPASSWD: /usr/sbin/ufw
SUDOEOF

if ! visudo -cf "$SUDOERS_TMP" >/dev/null 2>&1; then
    echo "ERROR: generated sudoers failed visudo validation — aborting" >&2
    visudo -cf "$SUDOERS_TMP" >&2 || true
    exit 1
fi

install -m 440 -o root -g root "$SUDOERS_TMP" "$SUDOERS_FILE"
echo "[SITREP] Sudoers rule installed at $SUDOERS_FILE (user: $SERVICE_USER)"
