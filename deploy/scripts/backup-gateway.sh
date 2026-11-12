#!/usr/bin/env bash
# Backup durable gateway state (audit, metrics, oauth store). No secrets in archive name.
set -euo pipefail
ROOT="${MCP_DATA_ROOT:-/var/lib/global-server-mcp}"
OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
ARCHIVE="${OUT_DIR}/mcp-gateway-${STAMP}.tar.gz"
tar -czf "$ARCHIVE" \
  -C "$ROOT" \
  $( [ -d "$ROOT/logs" ] && echo logs ) \
  $( [ -f "$ROOT/oauth-store.json" ] && echo oauth-store.json ) \
  2>/dev/null || tar -czf "$ARCHIVE" -C "$ROOT" .
echo "Wrote $ARCHIVE"
sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256"
echo "Checksum ${ARCHIVE}.sha256"
