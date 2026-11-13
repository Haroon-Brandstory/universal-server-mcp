# AGENTS.md — global-server-mcp

## Purpose
Policy-gated MCP gateway. **This branch (`feat/bsd-global-mcp`)** is locked to **Brandstory Global** only:
- FE Next.js → `/var/www/html/global-brandstory` (local: `…/global-brandstory`)
- BE Strapi → `/var/www/html/global-backend/bsd-strapi` (local: `…/bsd-strapi`)
- Public MCP: `mcp.brandstoryglobal.com` · install root `/opt/bsd-global-mcp`
See `docs/BSD_GLOBAL_MCP.md`. Do not add other sites here.

## Hard rules
- Default deny. No host/capability/path → deny.
- Auth fail-closed. Never soft-allow anonymous stdio/HTTP.
- Live CodeOps: `code.write` / `code.edit` allowed on VPS allow_paths (Docker rw mounts). Stay inside FE/BE roots only.
- Git/build/server/db/deploy writes: `*.approval.create` → pending → human approves at `/operators` (`MCP_OPERATOR_TOKEN`) → tell agent approved → consume `approvalId`. Never put operator token in chat. See `docs/OPERATORS.md`.
- OAuth: operator consent required; tokens only to `oauth_allowed` principals.
- Browser sessions bound to principal — no cross-principal access.
- Never add unrestricted `eval`, raw shell, cookie dump, or arbitrary remote shell tools.
- Secrets via env/vault only — never in tool args or audit bodies.
- Authorized targets only (sites/APIs/repos/servers operator owns or has permission for).
- ServerOps: no root SSH automation; no auto agent install / SSH config mutation on VPS.
- DatabaseOps: no free-form prod SQL; env creds only; curated migrations + approvals.
- SecurityOps: registered targets only; no invasive pen-tests; no auto prod infra hardening.
- DeployOps: AI cannot self-approve prod; no CI bypass; no arbitrary deploy shell; prod dispatch off by default.
- Platform: honest certification (protocol ≠ verified; stack status in stack-profiles.yaml).
- Keep adapters thin; security lives in gateway.

## Layout
- `src/gateway.ts` — MCP server + tool dispatch
- `src/transport/httpServer.ts` — remote Streamable HTTP + legacy SSE
- `src/policy/` — allow/deny decisions
- `src/security/` — SSRF, rate limit, redact
- `src/adapters/*` + `src/platform/` — execution + registry/observability
- `config/policy.yaml` — principals + ops policy + capabilities
- `config/projects.yaml` — universal project registry
- `config/stack-profiles.yaml` — stack support status
- `config/servers|databases|security|deployments.yaml` — module registries

## Commands
- `npm run dev` — stdio MCP (tsx) — Cursor local
- `npm run dev:http` — remote MCP on `MCP_HTTP_HOST:MCP_HTTP_PORT` (default 127.0.0.1:7337)
- `npm run build && npm start` — production stdio
- `npm run start:http` / `npm run start:prod` — production HTTP
- `npm test` / `npm run ci` — unit tests (+ typecheck/build)
- `npm run docker:build` / `docker compose up` — packaged gateway (non-root)
- Edge TLS template: `deploy/nginx/mcp.example.com.conf` (placeholder domain)

## Production honesty
- Protocol ≠ verified clients — see `MCP_CLIENT_COMPATIBILITY_MATRIX.md`
- Keep `allow_production_dispatch: false` until live checklist signed
- Phases 9–14 reports under `PHASE9_14_IMPLEMENTATION_REPORT.md` + `MCP_*.md`

## Adding a tool
1. Add capability name in `src/types.ts`
2. Register in `src/tools/definitions.ts`
3. Gate with `requireCap` + host/SSRF as needed
4. Allow capability on principals in `config/policy.yaml`
5. Audit allow/deny

See `docs/agents/` for role guidance.
