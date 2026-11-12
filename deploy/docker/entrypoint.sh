#!/bin/sh
set -eu
# Ensure writable data dirs (Render disk mount may start empty).
mkdir -p /data/logs /data/build-workspaces /data/secrets 2>/dev/null || true

# Optional: materialize SSH key/known_hosts from env *contents* into files.
# Set MCP_SSH_KEY_FE_PEM / MCP_SSH_KNOWN_HOSTS_FE (multiline) on Render, then
# point servers.yaml private_key_path_env at MCP_SSH_KEY_FE_PATH (file path).
materialize_secret() {
  _content_var="$1"
  _path_var="$2"
  _dest="$3"
  _mode="$4"
  eval "_content=\${${_content_var}:-}"
  if [ -n "${_content}" ]; then
    printf '%s\n' "$_content" > "$_dest"
    chmod "$_mode" "$_dest"
    export "${_path_var}=${_dest}"
  fi
}

materialize_secret MCP_SSH_KEY_FE_PEM MCP_SSH_KEY_FE_PATH /data/secrets/fe_id_ed25519 600
materialize_secret MCP_SSH_KNOWN_HOSTS_FE MCP_SSH_KNOWN_HOSTS_FE_PATH /data/secrets/fe_known_hosts 644
materialize_secret MCP_SSH_KEY_BE_PEM MCP_SSH_KEY_BE_PATH /data/secrets/be_id_ed25519 600
materialize_secret MCP_SSH_KNOWN_HOSTS_BE MCP_SSH_KNOWN_HOSTS_BE_PATH /data/secrets/be_known_hosts 644

# Force HTTP on PaaS — never fall back to stdio (stdin closes → instant exit).
export MCP_TRANSPORT=http
export MCP_HTTP_HOST="${MCP_HTTP_HOST:-0.0.0.0}"

# Prefer platform PORT (Render). Drop conflicting pin if present without PORT.
if [ -n "${PORT:-}" ]; then
  unset MCP_HTTP_PORT 2>/dev/null || true
fi

echo "global-server-mcp starting transport=http host=${MCP_HTTP_HOST} port=${PORT:-${MCP_HTTP_PORT:-7337}}"
exec "$@"
