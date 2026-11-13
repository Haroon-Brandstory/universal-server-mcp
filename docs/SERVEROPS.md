# ServerOps

Multi-server VPS monitoring + constrained maintenance for MCP agents.

## Tools

| Tool | Class | Purpose |
|---|---|---|
| `server.list` | read | Authorized servers (no secrets) |
| `server.health` / `metrics` / `services` / `service.status` | read | Health probes |
| `server.logs.read` | read | Sanitized truncated logs |
| `server.ssl.status` / `disk.status` / `processes` / `security.status` | read | Ops snapshots |
| `server.service.restart` / `cache.clear` / `maintenance.run` | write | Approved maintenance only |
| `server.approval.create` | admin | Short-lived maintenance approval |

## Registry (`config/servers.yaml`)

Each server: `id`, `project_id`, `environment`, `connection`, `services`, `approved_maintenance`, `monitoring`.

- Access = principal `projects` ∩ server `project_id`
- Health URLs + SSL hosts come from registry only (never AI-supplied)
- `connection.method: mock` for tests; `ssh` for real hosts

## SSH transport

- Non-root user required
- Key path + known_hosts via env vars (`private_key_path_env`, `known_hosts_path_env`)
- `BatchMode=yes`, `PasswordAuthentication=no`, `StrictHostKeyChecking=yes`
- Curated argv only; shell metacharacters rejected
- Does **not** install agents or rewrite remote SSH config
- Secrets never returned to clients

## Service profiles

Extensible in `src/adapters/server/profiles.ts`: nginx, apache, systemd, pm2, docker, nextjs, strapi, postgres.

BSD Global Docker: set `MCP_PM2_BIN` / `MCP_NPM_BIN` / `MCP_PM2_NEXTJS_NAME` / `MCP_PM2_STRAPI_NAME` (defaults `frontend-nextjs`, `strapi-backend`). Host bridge: `deploy/host/install-pm2-bridge.sh`.

Register more with `registerServiceProfile()` — no gateway change.

## Maintenance controls

1. Server must list action in `approved_maintenance`
2. Principal `write: true` + write capability
3. `server.approval.create` → `approvalId`
4. Confirm `confirmServerId` + `confirmEnvironment`
5. Rate limit + per-server lock + before/after state + timeout
6. `server.maintenance.run` accepts predefined action ids only (`nginx.reload`, `pm2.save`, `disk.inode.check`)

## Policy

```yaml
serverops:
  enabled: true
  servers_path: ./config/servers.yaml
  require_maintenance_approval: true
  maintenance_rate_limit_per_min: 5
  default_timeout_sec: 30
  max_log_bytes: 64000
```

Production default: grant read tools only; omit restart/maintenance caps.

## Env

```bash
# MCP_SERVERS_PATH=./config/servers.yaml
# Per-server (example):
# MCP_SERVER_STAGING_KEY_PATH=/secure/keys/mcp-monitor-staging
# MCP_SERVER_STAGING_KNOWN_HOSTS=/secure/known_hosts/staging
```

## Safety

- No arbitrary remote shell tool
- No unrestricted sudo (fixed `-n` paths in profiles only)
- No live prod VPS required for CI — use mock transport/fixtures
