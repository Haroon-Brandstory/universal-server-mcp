# DeployOps

Secure multi-project release management for MCP agents. Staging automation + production **request** with human approval. No arbitrary shell; no secrets in tool args.

## Tools

| Tool | Class | Purpose |
|---|---|---|
| `deploy.projects` / `environments` / `history` | read | Registry + audit history |
| `deploy.plan` | read | E2E pipeline plan (GitOps→Build→Security→PR→approve→deploy) |
| `deploy.validate` | read | CI/security/db gates — CI bypass rejected |
| `deploy.staging` | write | Staging provider dispatch |
| `deploy.status` | read | Deploy record + provider status |
| `deploy.production.request` | write | Prod deploy **after** human `approvalId` |
| `deploy.rollback.plan` / `request` | read/write | Known-good rollback + approval |
| `deploy.approval.create` | admin | Human `deploy_approver` only; cannot self-approve |

## Registry (`config/deployments.yaml`)

Per project: environments with `provider`, `profile`, workflow/server/action, health checks, `requires_db_compat`.

Providers (first-class): `github_actions`, `vps`. Extensible stubs: `docker`, `pm2`, `systemd`, `vercel` (mock until tested).

Profiles (data, not hardcoded in core): nextjs, strapi, wordpress, django, laravel, springboot, docker, static.

## Approvals

- Bound to: requestor, project, environment, commit SHA, workflow, action
- Approver ≠ requestor
- Single-use; expired/reused rejected
- Production dispatch also gated by `allow_production_dispatch` (default **false**)

## Pipeline

```
AI Request → GitOps branch → changes → BuildOps tests → SecurityOps
→ PR → human approval → staging → health → production approval
→ production deploy → post checks
```

## Rollback

History + `known_good_shas` + latest healthy deploy. Plans include DB migration risk when `requires_db_compat`.

## Policy

```yaml
deployops:
  enabled: true
  deployments_path: ./config/deployments.yaml
  history_path: ./data/deploy-history.json
  allow_production_dispatch: false
  force_mock_providers: false
  require_ci_green: true
  require_security_gate: true
```
