#!/usr/bin/env bash
# Restore gateway durable state from backup archive. Stops service first (operator).
set -euo pipefail
ARCHIVE="${1:?usage: restore-gateway.sh <archive.tar.gz> [data-root]}"
ROOT="${2:-${MCP_DATA_ROOT:-/var/lib/global-server-mcp}}"
if [[ -f "${ARCHIVE}.sha256" ]]; then
  sha256sum -c "${ARCHIVE}.sha256"
fi
mkdir -p "$ROOT"
tar -xzf "$ARCHIVE" -C "$ROOT"
echo "Restored into $ROOT — restart gateway (systemctl restart global-server-mcp or docker compose up -d)"
