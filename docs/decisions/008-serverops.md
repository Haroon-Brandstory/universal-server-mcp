# ADR 008 — ServerOps multi-VPS registry + restricted SSH

## Decision
Add ServerOps: YAML server registry, project/environment scoped access, OpenSSH BatchMode transport with host-key verification, extensible service profiles, read-only health tools, and approval-gated constrained maintenance. No arbitrary remote shell; no auto agent install / SSH config mutation.

## Why
Agents need multi-VPS visibility and safe restarts without root automation or secrets in MCP responses.

## Consequences
- Servers declared in `config/servers.yaml` (path via `serverops.servers_path`)
- Access filtered by principal `projects`
- Profiles (`nginx`/`pm2`/`nextjs`/`strapi`/…) own curated argv — gateway stays thin
- Maintenance requires server allowlist + approval + confirmations + rate limit + lock
- Production policies should expose read tools only unless operators deliberately add write caps
- Tests use `MockServerTransport` / `method: mock` — no live VPS
