#!/usr/bin/env bash
# Fix EACCES on /data after a bad UID switch (OAuth /token 500, audit denied).
# Run on VPS with sudo.
set -euo pipefail

MCP_UID=10001
MCP_GID=10001

VOL="$(docker volume ls -q | grep -E 'bsd-global-mcp-data$' | head -n1 || true)"
if [[ -z "${VOL}" ]]; then
  echo "No docker volume matching *bsd-global-mcp-data" >&2
  docker volume ls >&2 || true
  exit 1
fi

echo "Repairing volume ${VOL} → ${MCP_UID}:${MCP_GID}"
docker run --rm -v "${VOL}:/data" alpine:3.20 \
  chown -R "${MCP_UID}:${MCP_GID}" /data

echo "Done. Recreate container as user 10001:10001, then:"
echo "  curl -sS https://mcp.brandstoryglobal.com/healthz"
echo "  docker logs bsd-global-mcp --tail 50"
