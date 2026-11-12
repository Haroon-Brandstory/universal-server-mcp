#!/bin/sh
set -eu
# Ensure writable data dirs (Render disk mount may start empty).
mkdir -p /data/logs /data/build-workspaces 2>/dev/null || true

# Force HTTP on PaaS — never fall back to stdio (stdin closes → instant exit).
export MCP_TRANSPORT=http
export MCP_HTTP_HOST="${MCP_HTTP_HOST:-0.0.0.0}"

# Prefer platform PORT (Render). Drop conflicting pin if present without PORT.
if [ -n "${PORT:-}" ]; then
  unset MCP_HTTP_PORT 2>/dev/null || true
fi

echo "global-server-mcp starting transport=http host=${MCP_HTTP_HOST} port=${PORT:-${MCP_HTTP_PORT:-7337}}"
exec "$@"
