# Security & production readiness checklist

## AuthN / AuthZ
- [ ] Strong unique `MCP_API_KEY` / operator keys
- [ ] Remote principals least privilege; `oauth_allowed` never on operator
- [ ] `revoked_principal_ids` process documented
- [ ] Tool discovery filtered; write/admin flags correct

## Isolation
- [ ] Per-principal browser sessions
- [ ] Per-principal build workspaces
- [ ] Project-scoped repos/servers/dbs/security/deploy targets

## Secrets
- [ ] No secrets in YAML tool args or audit bodies
- [ ] DB/SSH/GitHub credentials via env/vault only
- [ ] Credential rotation schedule documented

## Privileged actions
- [ ] Human approval for Git write / build network / server maint / DB migrate / deploy prod
- [ ] AI cannot self-approve deploys
- [ ] `allow_production_dispatch: false` until explicitly authorized
- [ ] `allow_production_migrations: false` / `allow_production_scans: false` reviewed

## Observability
- [ ] Audit JSONL retained & reviewed
- [ ] `/healthz` monitored
- [ ] Metrics/traceIds acceptable to ops
- [ ] Alerting on deny spikes / kill switch

## Rollback / emergency
- [ ] Deploy history + known_good_shas
- [ ] Kill switch tested
- [ ] Rollback plan exercised on staging

## Honest certification
- [ ] Client integrations labeled protocol vs verified
- [ ] Stack profiles status accurate
