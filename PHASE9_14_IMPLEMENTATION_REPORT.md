# Phases 9–14 Implementation Report — Production Integration, Hardening & Certification

**Date:** 2026-11-12  
**Constraint:** No live VPS/DB/prod deploy; `allow_production_dispatch` remains false; no credential disclosure  
**Repo note:** Workspace has no `.git` root at audit time — CI/workflows added for when git remote exists; no merge to main performed

---

## 1. Gap matrix (pre → post)

| Feature | Existing implementation | Missing configuration | Required modification | Validation method | Priority |
|---|---|---|---|---|---|
| Module adapters Web→Deploy | Implemented (Phases 2–8) | Live keys/hosts | None (preserve) | Unit/fixture tests | P0 |
| Gateway AuthN/AuthZ/SSRF | Implemented | Prod keys/OAuth URL | None | Tests + checklist | P0 |
| Docker / non-root package | Missing → **Added** | `.env.docker`, secrets mounts | Dockerfile, compose | `docker build` / CI | P0 |
| GitHub Actions CI | Missing → **Added** | Repo on GitHub | `.github/workflows/ci.yml` | CI run | P0 |
| Nginx TLS edge | Missing → **Added** | Real domain + certs | `deploy/nginx/mcp.example.com.conf` | Operator apply | P0 |
| systemd unit | Missing → **Added** | Install paths | `deploy/systemd/...` | Operator | P1 |
| Log rotation / backup | Partial docs → **Added** | Paths on host | logrotate + scripts | Dry-run scripts | P1 |
| Client certification | Docs protocol-only | Live E2E per client | Matrix + checklist | Operator E2E | P0 |
| GitHub App live | Adapter mock-tested | App install + PEM | Checklist only | Mock tests + operator | P0 |
| Next/Strapi onboard | projects.yaml partial | Staging URLs/creds | Templates | Config review | P0 |
| VPS ServerOps live | Adapter + mock | known_hosts, mcp-ops user | Guide + template | Mock + operator | P0 |
| DB read-only live | Drivers + mock | RO roles, env refs | Template | Optional local PG | P1 |
| Security scanners live | Mock if CLI absent | Install CLIs | Docs honesty | Mock tests | P1 |
| E2E AI workflow | Implicit → **Encoded** | Fixture repo | `workflowPipeline.ts` | New unit tests | P0 |
| Prod deploy dispatch | Implemented deny | Human sign-off | Keep false | Policy assert | P0 |
| Multi-stack honesty | stack-profiles.yaml | — | Retained | Docs | P1 |
| DR / restart | SIGTERM present | Persistent volumes | Docs + backup scripts | Local fixture | P1 |
| IdP / mTLS | Not implemented | — | Deferred | — | P2 |
| OpenAPI invoker | Not implemented | — | Deferred | — | P2 |

---

## 2. What shipped this session

### Packaging / hosting
- `Dockerfile` (multi-stage, user `mcp` uid 10001, tini, HEALTHCHECK)
- `docker-compose.yml` (read-only rootfs, cap_drop ALL, no-new-privileges)
- `.dockerignore`
- `deploy/nginx/mcp.example.com.conf`
- `deploy/systemd/global-server-mcp.service`
- `deploy/logrotate/global-server-mcp`
- `deploy/scripts/backup-gateway.sh`, `restore-gateway.sh`
- `.github/workflows/ci.yml`
- `package.json` scripts: `ci`, `start:prod`, `docker:*`, `audit:deps`
- ADR `docs/decisions/013-production-hardening.md`

### Onboarding templates
- `config/templates/project-nextjs.yaml.example`
- `config/templates/project-strapi.yaml.example`
- `config/templates/server-vps.yaml.example`
- `config/templates/database-readonly.yaml.example`

### Workflow gate
- `src/platform/workflowPipeline.ts` + tests (staging path OK; prod blocked without flags/approver)

### Deliverable documents
- `MCP_PRODUCTION_READINESS.md`
- `MCP_CLIENT_COMPATIBILITY_MATRIX.md`
- `MCP_VPS_ONBOARDING_GUIDE.md`
- `MCP_NEXTJS_STRAPI_INTEGRATION.md`
- `MCP_SECURITY_REVIEW.md`
- `MCP_LIVE_TEST_CHECKLIST.md`
- This report

---

## 3. Explicitly NOT done (blocked / deferred)

| Item | Status |
|---|---|
| Deploy gateway to live management VPS | Blocked — operator |
| Connect live SSH to prod/staging VPS | Blocked — needs explicit auth |
| Enable `allow_production_dispatch` | Blocked — must stay false |
| Live Cursor/Grok/Claude/ChatGPT E2E certify | Operator Verification Required |
| Live GitHub App against real repos | Configuration required |
| Production DB migrations | Forbidden |
| Destructive DR on prod | Forbidden |
| External IdP / mTLS | Not implemented (backlog) |
| Git feature-branch commit (no `.git` here) | Blocked — init remote first |

---

## 4. Tests

| Suite | Result |
|---|---|
| Pre-change baseline | 120 pass |
| Post-change (`npm run ci`) | **125 pass / 0 fail** (+5 workflowPipeline) |
| Live client / VPS / GitHub | Not run (blocked) |
| Docker smoke | CI job defined; local docker optional |

---

## 5. Credentials required (names/scopes only)

- `MCP_API_KEY`, `MCP_OAUTH_OPERATOR_KEY`
- `MCP_PUBLIC_BASE_URL` (HTTPS)
- `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH` (contents: metadata read, PR create; no admin)
- Per-server `MCP_SSH_KEY_*`, `MCP_SSH_KNOWN_HOSTS_*`
- DB `*_READONLY_*` env pairs; migrate pair separate
- TLS certs for real hostname replacing `mcp.example.com`

---

## 6. Operator next steps

1. Init/push git remote; confirm CI green.
2. Fill `.env` / `.env.docker` (never commit).
3. Apply Nginx + TLS for real domain; set `MCP_PUBLIC_BASE_URL`.
4. Install GitHub App on FE/BE repos; wire PEM.
5. Provision `mcp-ops` SSH users + known_hosts (see VPS guide).
6. Create staging RO DB roles; bind in `databases.yaml`.
7. Run `MCP_LIVE_TEST_CHECKLIST.md`; promote clients to verified only with evidence.
8. Keep prod dispatch false until checklist + human sign-off.

---

## 7. Continuation plan (if more sessions)

- Wire disposable fixture GitHub repo for live GitOps smoke (still non-prod).
- Optional local PG container for DatabaseOps live smoke.
- Mark first verified client after recorded E2E.
- Shared lock store if multi-replica gateway.
