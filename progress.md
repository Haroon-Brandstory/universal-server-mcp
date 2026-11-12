# Progress — global-server-mcp

## Current state (2026-11-12) — Phases 9–14 Production Hardening
- Phases 1–8 retained (modules + platform)
- Docker/compose non-root packaging, Nginx TLS template, systemd, logrotate, backup scripts
- GitHub Actions CI (typecheck/test/build/secret-scan/docker smoke)
- Next.js/Strapi/VPS/DB onboarding templates
- Client compatibility matrix + live test checklist (protocol until E2E)
- Workflow gate tests (`workflowPipeline`) — prod dispatch stays false
- Reports: `PHASE9_14_IMPLEMENTATION_REPORT.md`, `MCP_PRODUCTION_READINESS.md`, etc.

## Next
- [ ] Init/push git remote; confirm CI green
- [ ] Operator: TLS domain, GitHub App, staging SSH/DB RO roles
- [ ] Record first verified client E2E
- [ ] External IdP / mTLS AuthN
- [ ] OpenAPI invoker
- [ ] Shared locks for multi-replica gateway
- [ ] CMS page create tools / vision / page.screenshot

## Done
- [x] Project scaffold + TypeScript MCP
- [x] Policy + SSRF + audit + rate limit
- [x] HTTP + Playwright adapters
- [x] AGENTS.md + docs skeleton
- [x] HTTP+SSE / Streamable HTTP remote transport (ADR 002)
- [x] OAuth PKCE for grok.com connectors (ADR 003)
- [x] CodeOps allow_paths tools (ADR 004)
- [x] Phase 1 hardening (ADR 005)
- [x] Phase 2 GitOps (ADR 006)
- [x] Phase 3 BuildOps (ADR 007)
- [x] Phase 4 ServerOps (ADR 008)
- [x] Phase 5 DatabaseOps (ADR 009)
- [x] Phase 6 SecurityOps (ADR 010)
- [x] Phase 7 DeployOps (ADR 011)
- [x] Phase 8 Universal Platform (ADR 012)
- [x] Phases 9–14 production packaging + certification docs (ADR 013)
