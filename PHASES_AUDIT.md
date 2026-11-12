# Phases 1–8 Audit — `global-server-mcp`

**Date:** 2026-11-12  
**Method:** Source + ADR + phase report cross-check; `npm test` → **120 pass / 0 fail**  
**Scope:** In-repo only (no live prod VPS/DB/deploy)

**Verdict legend:** PASS = delivered + wired | PARTIAL = delivered with intentional gaps | FAIL = missing claimed work

---

## Rollup

| Phase | Name | ADR | Report | Verdict |
|---|---|---|---|---|
| 1 | Hardening | 005 | (in ADR/docs) | **PASS** |
| 2 | GitOps | 006 | `PHASE2_GITOPS_REPORT.md` | **PASS** |
| 3 | BuildOps | 007 | `PHASE3_BUILDOPS_REPORT.md` | **PASS** |
| 4 | ServerOps | 008 | `PHASE4_SERVEROPS_REPORT.md` | **PASS** |
| 5 | DatabaseOps | 009 | `PHASE5_DATABASEOPS_REPORT.md` | **PASS** |
| 6 | SecurityOps | 010 | `PHASE6_SECURITYOPS_REPORT.md` | **PASS** |
| 7 | DeployOps | 011 | `PHASE7_DEPLOYOPS_REPORT.md` | **PASS** |
| 8 | Universal Platform | 012 | `PHASE8_PLATFORM_REPORT.md` | **PASS** |

**Overall:** Phases 1–8 complete in code. Residual = operator live wiring + honest non-claims (prod dispatch off, stubs, protocol clients).

**Tool surface (definitions):** audit 1 · build 8 · code 5 · db 14 · deploy 11 · git 11 · http 1 · page 5 · platform 3 · policy 1 · security 9 · server 14 · session 2

---

## Phase 1 — Hardening — PASS

| Claim | Evidence | Status |
|---|---|---|
| OAuth operator consent (no auto-approve) | `src/auth/oauthConsent.ts`, `oauthProvider.ts`, `/oauth/consent` | PASS |
| Durable hashed OAuth store | ADR 005 + auth store | PASS |
| `tools/list` filtered by principal | `toolsForPrincipal` in `gateway.ts` | PASS |
| Browser session principal bind | `session/manager.ts` get/close owner check | PASS |
| Policy profiles | `config/policy.*.example.yaml` | PASS |
| SSRF / rate limit / kill switch retained | `security/`, gateway | PASS |

**Gap:** Live Grok/Cursor OAuth E2E Not Verified this pass.

---

## Phase 2 — GitOps — PASS

| Claim | Evidence | Status |
|---|---|---|
| GitHub App/API adapter | `src/adapters/git/` | PASS |
| Project-scoped repos | policy + git gates | PASS |
| Read/write/admin tools | 11 `git.*` tools | PASS |
| Approvals; no force-push/merge | approval + branch guards | PASS |
| Docs + ADR 006 + report | present | PASS |

**Gap:** Live GitHub App creds = operator; tests mock Octokit.

---

## Phase 3 — BuildOps — PASS

| Claim | Evidence | Status |
|---|---|---|
| Stack detect + curated tasks | `src/adapters/build/` | PASS |
| Docker preferred / process opt-in | runners + policy | PASS |
| Network/install approvals | build approval path | PASS |
| Fixtures + report ADR 007 | present | PASS |

**Gap:** Multi-language runners beyond curated tasks still limited.

---

## Phase 4 — ServerOps — PASS

| Claim | Evidence | Status |
|---|---|---|
| `servers.yaml` registry | `config/servers.yaml` | PASS |
| Health/metrics/services/logs/ssl/disk | 14 `server.*` tools | PASS |
| Non-root SSH + mock; curated argv | adapter + controls | PASS |
| Maintenance approvals/locks | present | PASS |
| No auto agent install / root SSH | AGENTS + code | PASS |

**Gap:** Live VPS Not Verified; known_hosts/keys operator-owned.

---

## Phase 5 — DatabaseOps — PASS

| Claim | Evidence | Status |
|---|---|---|
| PG/MySQL(+Maria) drivers | `pg`, `mysql2` + `adapters/db` | PASS |
| Read tools + curated migrate | 14 `db.*` tools | PASS |
| Env cred refs; no password in views | controls | PASS |
| Prod migrate default deny | `allow_production` / backupVerifiedId | PASS |
| Mongo/SQLite/Redis | planned only | PARTIAL (honest non-claim) |

**Gap:** Optional live smoke env-gated; free-form prod SQL absent by design.

---

## Phase 6 — SecurityOps — PASS

| Claim | Evidence | Status |
|---|---|---|
| Registered targets only | `config/security.yaml` | PASS |
| SAST/secrets/deps/server audit path | scanners + findings | PASS |
| Remediation plan (non-auto-harden) | `security.remediation.plan` | PASS |
| Prod non-passive scans default deny | `allow_production_scans` | PASS |
| Missing CLIs → mock | Semgrep/Trivy/etc | PARTIAL (by design) |

**Gap:** Mock findings ≠ confirmed vulns.

---

## Phase 7 — DeployOps — PASS

| Claim | Evidence | Status |
|---|---|---|
| Staging + production.request + rollback | `adapters/deploy` | PASS |
| Human approver ≠ requestor | deploy approval | PASS |
| SHA/workflow-bound tickets | operations + tests | PASS |
| `allow_production_dispatch: false` | policy + platform.info | PASS |
| GHA + VPS first; others stub | providers | PARTIAL (honest) |

**Gap:** Real prod dispatch blocked; AI cannot self-approve.

---

## Phase 8 — Universal Platform — PASS

| Claim | Evidence | Status |
|---|---|---|
| `projects.yaml` merge | `projectRegistry.ts` + `config.ts` | PASS |
| Module catalog + stack profiles | `modules.ts`, `stack-profiles.yaml` | PASS |
| Observability metrics/traceId | `observability.ts`, gateway | PASS |
| Safe-read retry | `retry.ts` | PASS |
| Platform tools + revocation | `platform.*`, revoked list | PASS |
| Client/onboarding docs | `docs/clients/*`, `docs/onboarding/*` | PASS |
| Integration matrix tests | `platform.test.ts` in 120 | PASS |

**Gap:** Client UIs mostly `protocol` not verified; IdP/mTLS/OpenAPI/Docker packaging still next (progress.md).

---

## Cross-phase invariants (still held)

1. Default deny; no unrestricted shell/eval/cookie dump  
2. Secrets via env/vault — not tool args  
3. Gateway spine retained (`gateway.ts` + thin adapters)  
4. Protocol ≠ certified for clients/stacks  
5. No live prod infra mutation in this audit  

---

## Verification this audit

```
npm test → 120 pass, 0 fail, 42 suites
Artifacts: ADRs 005–012 OK; adapters git/build/server/db/security/deploy OK
Registries: projects/servers/databases/security/deployments/stack-profiles OK
```

## Next (not phase reopen)

- Operator wire non-prod keys/hosts/DB roles  
- Mark clients verified only after E2E  
- Optional: gateway CI/container, shared locks for multi-replica  
- progress.md backlog: IdP/mTLS, OpenAPI, Docker sandbox, CMS/vision tools  
