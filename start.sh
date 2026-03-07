#!/usr/bin/env bash
# Gas Town GUI startup script
# Serves the GUI on 0.0.0.0:7667 with CORS * enabled
# Designed for use with systemd or direct invocation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load nvm if available (for user-level Node.js installations)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

# Verify node is available
if ! command -v node &>/dev/null; then
  echo "ERROR: node not found. Install via nvm or system package." >&2
  exit 1
fi

# Ensure dependencies are installed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  npm install --prefix "$SCRIPT_DIR" --production
fi

# Configuration (override via environment)
export HOST="${HOST:-0.0.0.0}"
export GASTOWN_PORT="${GASTOWN_PORT:-7667}"
export CORS_ORIGINS="${CORS_ORIGINS:-*}"

exec node "$SCRIPT_DIR/server.js"
