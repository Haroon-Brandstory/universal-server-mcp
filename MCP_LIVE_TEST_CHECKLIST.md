# MCP Live Test Checklist

Mark each row only with evidence. Default = **not run**. Do not invent passes.

Legend: `[ ]` pending · `[x]` pass · `[F]` fail · `[B]` blocked · `[N/A]`

## A. Gateway host (management VPS / local Docker)

- [ ] `npm run ci` green on clean checkout
- [ ] `docker build -t global-server-mcp:local .` succeeds
- [ ] Container `/healthz` returns `ok`
- [ ] SIGTERM drains sessions (graceful)
- [ ] Audit JSONL persists across restart (volume mount)
- [ ] OAuth store persists across restart
- [ ] Backup script produces archive + sha256
- [ ] Restore script restores on disposable data dir
- [ ] Nginx TLS to real hostname (not example.com) works
- [ ] HTTP→HTTPS redirect works
- [ ] `/metrics` without auth = deny
- [ ] Unauthenticated `/mcp` = deny

## B. Clients (per client)

For each: Cursor / Grok / Claude Desktop / Claude Code / ChatGPT / VS Code / Windsurf:

- [ ] Config loaded
- [ ] Handshake OK
- [ ] `tools/list` filtered
- [ ] Read tool OK (`policy.explain` or `platform.info`)
- [ ] Unauthorized tool denied
- [ ] Cross-principal session denied
- [ ] Status promoted to **verified** in matrix (date + versions noted)

## C. GitHub

- [ ] GitHub App installed on FE repo only as needed
- [ ] App installed on BE repo
- [ ] `git.repo.list` / `git.branch.list` OK
- [ ] Feature branch create OK (non-protected)
- [ ] Commit to protected branch denied
- [ ] PR create OK
- [ ] CI status read OK
- [ ] Force-push tool absent/denied

## D. Next.js / Strapi projects

- [ ] Registry entries match real OWNER/REPO
- [ ] CodeOps path confined to checkout
- [ ] BuildOps detect_stack plausible
- [ ] Staging health URL responds (operator browser/curl)
- [ ] Security target registered; scan labeled real vs mock

## E. VPS ServerOps

- [ ] known_hosts pin verified
- [ ] Non-root `mcp-ops` login OK
- [ ] `server.health` OK (staging)
- [ ] Arbitrary command rejected
- [ ] Maintenance requires approval
- [ ] Production host not enabled until authorized

## F. DatabaseOps

- [ ] RO credentials work on staging/local disposable DB
- [ ] Schema allowlist enforced
- [ ] Statement timeout enforced
- [ ] Write SQL via read tool denied
- [ ] Migrate blocked without approval / prod flag

## G. DeployOps

- [ ] Staging deploy path validated (mock or authorized staging)
- [ ] Production request creates ticket
- [ ] Self-approval denied
- [ ] `allow_production_dispatch` still **false**
- [ ] Rollback plan generated without executing prod rollback

## H. Workflow E2E (fixture)

- [ ] Unit `workflowPipeline` tests green
- [ ] Disposable repo or staging project walkthrough recorded
- [ ] Audit trail complete for walkthrough

## Sign-off

| Role | Name | Date | Prod dispatch authorized? |
|---|---|---|---|
| Operator | | | NO unless explicit |
| Security reviewer | | | |
| Release manager | | | |

**Production dispatch remains false until this section explicitly overridden by human operator in policy + change ticket.**
