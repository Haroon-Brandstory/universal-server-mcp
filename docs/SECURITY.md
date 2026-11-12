# Security model

## Principles
1. Default deny
2. Least privilege capabilities (read / write / admin classes)
3. Fail-closed authentication (stdio and HTTP)
4. SSRF protection (private/link-local/metadata) + browser final-URL re-check
5. No redirect following on HTTP adapter
6. Response redaction + size caps; audit URL query redaction
7. Audit every allow/deny (including auth resolve + OAuth consent)
8. Kill switch (`MCP_KILL_SWITCH=1` or policy)
9. Rate limits keyed by `principalId:sessionId`
10. Browser sessions bound to principal (cross-principal access denied)
11. OAuth requires operator consent — never auto-approve
12. OAuth tokens bind only to `oauth_allowed` principals (never privileged `local-dev`)

## Authentication
| Path | Rule |
|---|---|
| Stdio | `MCP_API_KEY` must match a principal (`api_key` / `api_key_env`). No soft allow. |
| HTTP | Bearer / `X-API-Key` API key **or** OAuth access token |
| OAuth | `/authorize` → `/oauth/consent` → operator key (`MCP_OAUTH_OPERATOR_KEY` / `oauth_operator` principal) → code → tokens |
| Token store | `MCP_OAUTH_STORE_PATH` (default `./data/oauth-store.json`), tokens hashed at rest (sha256) |
| DCR | Disabled unless `policy.oauth.allow_dynamic_registration: true` **and** `MCP_OAUTH_ALLOW_DCR=1` |
| Redirects | Exact allowlist (`policy.oauth.allowed_redirect_uris` + optional env) |

## Authorization
- Tool **discovery** filtered by principal capabilities + write/admin flags
- Tool **execution** re-checks capability class every call
- `write: false` blocks write-class tools and unsafe HTTP methods
- `admin: false` blocks admin-class tools (`audit.tail`)
- `projects[]` merge hosts/paths from `policy.projects`
- `environment` field documents policy tier (development/staging/production)

## Threats mitigated
- SSRF to cloud metadata / LAN (HTTP + browser final URL)
- OAuth auto-approve / privileged principal fallback
- Cross-client browser session hijack via sessionId
- Capability escalation via tools/list alone
- Secret leakage in tool output and audit URL targets (best-effort)
- Runaway agent loops (rate limit)
- CodeOps path escape / symlink escape / `.env` reads

## Policy profiles
| File | Use |
|---|---|
| `config/policy.yaml` | Active local default |
| `config/policy.development.example.yaml` | Dev template |
| `config/policy.staging.example.yaml` | Staging template (no writes) |
| `config/policy.production.example.yaml` | Prod template (privileged tools off) |

## BuildOps (Phase 3)
- Curated argv tasks only — no arbitrary shell MCP tool
- Docker non-privileged default; process runner forbidden in `environment: production`
- Per-job workspaces; concurrent project lock
- Network default none; install/network need `build.approval.create`
- Details: [BUILDOPS.md](./BUILDOPS.md)

## GitOps (Phase 2)
- Repos only from principal project `github_repos`
- Writes need `git.approval.create` → `approvalId`
- No force-push, no PR merge, no shell `git`
- No commits to deny-list / protected branches
- App/PAT credentials via env only — never in tool output
- Details: [GITOPS.md](./GITOPS.md)

## ServerOps (Phase 4)
- Servers from registry only; principal project scope
- Restricted SSH (non-root, keys + known_hosts, BatchMode) or mock
- Read tools default; maintenance needs approval + confirms + rate/lock
- No arbitrary remote shell; no auto agent install / SSH config rewrite
- Details: [SERVEROPS.md](./SERVEROPS.md)

## DatabaseOps (Phase 5)
- Connections from registry; env credential refs only
- Separate read/write identities; READ ONLY transactions on reads
- Schema allowlists + SQL SELECT guard + timeouts/row/byte caps + column redaction
- Migrations: curated files + approval + backupVerifiedId; prod apply off by default
- Restore plan-only (DeployOps)
- Details: [DATABASEOPS.md](./DATABASEOPS.md)

## SecurityOps (Phase 6)
- Targets from `config/security.yaml` only; project-scoped
- Defensive scanners (builtin + optional Semgrep/Trivy/Gitleaks/OSV/npm audit)
- Findings carry confidence + verification; unverified ≠ confirmed
- Remediation may open GitOps PR path — never auto-change prod servers
- Details: [SECURITYOPS.md](./SECURITYOPS.md)

## DeployOps (Phase 7)
- Deployments from `config/deployments.yaml`; provider adapters (GHA/VPS first)
- Human `deploy_approver` ≠ requestor; approval bound to project/env/SHA/workflow
- CI + security gates; conflicting deploy locks; immutable history
- `allow_production_dispatch` default false — no accidental prod ship
- Details: [DEPLOYOPS.md](./DEPLOYOPS.md)

## Platform (Phase 8)
- Project registry merge; module catalog; stack-profile honesty
- TraceId on tool calls; metrics JSONL; retry only for safe reads
- `platform.revoked_principal_ids` emergency denial
- Client docs distinguish protocol vs verified
- Checklist: [PRODUCTION_READINESS_CHECKLIST.md](./PRODUCTION_READINESS_CHECKLIST.md)

## Not in scope
- Full prompt-injection neutralization from page content
- Multi-tenant hard process isolation (use separate processes/containers for tenants)
- External IdP / mTLS
- Mobile / arbitrary code execution / unrestricted shell
- Unattended production deploys without human approval

## Operator duties
- Set strong `MCP_API_KEY` and `MCP_OAUTH_OPERATOR_KEY`
- Keep `allow_hosts` / `allow_paths` / `projects` minimal
- Never set `oauth_allowed: true` on privileged operator principals
- Production: `write: false`, `block_loopback: true`, copy production example
- Review `logs/audit.jsonl`
- HTTP: default bind `127.0.0.1`; expose only via TLS reverse proxy
- Persist / back up `data/oauth-store.json` if tokens must survive restarts across hosts
