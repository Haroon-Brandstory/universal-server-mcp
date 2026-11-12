# Next.js + Strapi Integration Guide

**Target path:** Cursor/Grok/Claude → MCP gateway → GitHub → Next.js / Strapi → staging VPS → (separate) prod auth  
**Rule:** Do not hardcode Next/Strapi into gateway core. Use `config/projects.yaml` + stack profiles + templates.

Existing seeds: `brandstory-fe`, `brandstory-be` in `config/projects.yaml` (local paths). Treat as **configuration examples**, not live-certified.

---

## Project A — Next.js frontend

| Concern | How |
|---|---|
| Registry | `config/templates/project-nextjs.yaml.example` → merge into `projects.yaml` |
| Stack | `stack_profile: nextjs` (`supported`, not certified) |
| Repo | `github_repos: [OWNER/REPO]` — do not invent names |
| Runtime | Node ≥20; detect package manager via lockfile in BuildOps |
| Build tasks | `node.install`, `node.build`, `node.test`, `node.lint`, `node.typecheck` |
| CodeOps paths | Absolute local checkout only under `allow_paths` |
| Server | Separate `server_ids` entry; health URL on staging host |
| Deploy | `deploy_project_id` → `deployments.yaml` (GHA/VPS provider) |
| Security | `security_target_ids` → repo + optional URL target |
| Clients | List in `authorized_clients` |

**Detection:** BuildOps stack detect + `package.json` / `next.config.*`.  
**Health:** Operator supplies staging URL (e.g. `/api/health`) in server/deploy profile — not assumed.

## Project B — Strapi backend

| Concern | How |
|---|---|
| Registry | `config/templates/project-strapi.yaml.example` |
| Stack | `stack_profile: strapi` |
| Repo | `OWNER/REPO` for Strapi app |
| Version | Read `@strapi/strapi` from package.json (operator/BuildOps detect) |
| DB | `database_ids` → PostgreSQL preferred; RO env refs |
| Build | node curated tasks; longer timeout OK |
| Server | PM2/systemd service name in ServerOps allowlist |
| Deploy | Strapi deploy profile in DeployOps |
| Health | Strapi health endpoint URL — operator confirmed |

**Never:** free-form prod SQL; migrate without backupVerifiedId + human approval; put DB passwords in YAML.

---

## GitHub live wiring (both)

1. Create GitHub App with least privilege: contents read/write (non-protected), PRs, checks read.
2. Install on **only** FE + BE repos (or org subset).
3. Set `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`.
4. Policy: protected branches deny direct commit; no force-push/merge tools.
5. Validate with mocks first; then staging branch/PR on non-prod repo.

## Recommended staging workflow

1. `code.*` / `git.file.read` on feature branch scope  
2. `git.branch.create` + `git.commit` + `git.pr.create` (approvals as required)  
3. `build.*` sandbox  
4. `security.scan.*` (authorized target)  
5. `deploy.staging` after human review  
6. `deploy.production.request` only — **no** auto dispatch  

Encoded in `src/platform/workflowPipeline.ts`.

## Same vs separate VPS

Register one or two servers. FE `server_ids` / BE `server_ids` independent. Database only on BE project.

## Gaps / honesty

| Item | Status |
|---|---|
| Local path registry for brandstory-* | Configured in YAML |
| Live GitHub App | Configuration required |
| Live staging deploy | Operator Verification Required |
| Stack certified | No — `supported` only |
