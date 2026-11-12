# MCP Production Readiness Report

**Project:** `global-server-mcp`  
**Date:** 2026-11-12  
**Evidence basis:** Source + unit/fixture tests + packaging added in Phases 9–14. Live infra **not** claimed verified.

## Status scale

| Status | Meaning |
|---|---|
| Verified | Evidence from automated or recorded live test |
| Implemented but not verified | Code present; live/E2E not proven here |
| Configuration required | Code ready; operator must supply config/secrets |
| Partially implemented | Incomplete or stub/mock path |
| Not implemented | Absent |
| Blocked | Waiting on operator/policy/external system |

---

## Scorecard

| # | Area | Status | Notes |
|---|---|---|---|
| 1 | MCP gateway security | Implemented but not verified | Default-deny, SSRF, redact, kill switch; edge TLS via Nginx template |
| 2 | Authentication & authorization | Implemented but not verified | API key + OAuth consent; `oauth_allowed` principals |
| 3 | Client interoperability | Partially implemented | Guides exist; certification mostly protocol |
| 4 | Project isolation | Implemented but not verified | projects.yaml + capability scopes |
| 5 | Server connectivity | Configuration required | SSH adapter + mock; live VPS blocked |
| 6 | Database safety | Implemented but not verified | RO path, timeouts, allowlists; prod migrate deny |
| 7 | GitHub integration | Configuration required | Adapter + mocks; App install needed |
| 8 | Build isolation | Implemented but not verified | Curated tasks; docker preferred |
| 9 | Cybersecurity tools | Partially implemented | Mock when CLI missing; honesty required |
| 10 | Deployment approval enforcement | Verified (unit) | Self-approve deny + dispatch false in tests |
| 11 | Monitoring | Implemented but not verified | `/healthz`, metrics JSONL, audit JSONL |
| 12 | Backup and recovery | Partially implemented | Scripts + docs; not exercised on prod |
| 13 | Multi-stack extensibility | Implemented but not verified | Registry + stack-profiles honesty |
| 14 | Overall operational readiness | Configuration required | Packaging ready; live host not deployed |

**Overall:** Foundation ready for **staging management-VPS bring-up**. **Not** production-certified for live customer traffic control until checklist signed.

---

## Production blockers

1. No live management VPS deploy of gateway yet (by design this phase).
2. Real TLS domain + `MCP_PUBLIC_BASE_URL` unset for prod-like remote clients.
3. GitHub App credentials not assumed present.
4. VPS `mcp-ops` accounts / known_hosts not provisioned in this session.
5. Client E2E not recorded → cannot mark Verified.
6. `allow_production_dispatch` must remain **false**.
7. Git remote/CI not runnable until repository initialized on a host.

## Safe to do now

- Run `npm run ci` locally.
- Build Docker image locally.
- Fill registries with staging-only targets.
- Practice workflow on fixture/mock paths.

## Must not do

- Enable production dispatch automatically.
- Soft-allow anonymous MCP.
- Expose `/metrics` without AuthN + network ACL.
- Treat mock scanner output as confirmed vulns.
