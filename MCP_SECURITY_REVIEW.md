# MCP Security Review (Phases 9–14)

**Date:** 2026-11-12  
**Scope:** Gateway packaging + existing AuthZ spine + scanner honesty. No live invasive scans performed.

## Strengths (retained)

- Default-deny YAML; capability classes; project scope
- Fail-closed AuthN (stdio + HTTP)
- OAuth PKCE + **operator consent** (no auto-approve)
- Principal-bound browser sessions; filtered `tools/list`
- SSRF + host allowlists; output redaction
- No unrestricted shell/eval/cookie-dump/root-SSH tools
- Human approvals for privileged Git/Build/Server/DB/Deploy
- AI cannot self-approve production deploy
- `allow_production_dispatch|migrations|scans` default false
- Secrets via env/vault names only

## Packaging hardening added

| Control | Implementation |
|---|---|
| Non-root container | uid/gid 10001 `mcp` |
| Drop capabilities | compose `cap_drop: ALL`, `no-new-privileges` |
| Read-only root FS | compose `read_only: true` + tmpfs `/tmp` |
| Healthcheck | Docker HEALTHCHECK → `/healthz` |
| Edge TLS | Nginx template HTTPS-only |
| Metrics exposure | Auth required; Nginx ACL recommended |
| Secret scan CI | Pattern grep + optional Gitleaks |
| Dependency audit | `npm audit` in CI (high+) |

## SecurityOps tooling honesty

| Tool | When binary present | When absent |
|---|---|---|
| Semgrep | Real findings possible | Mock — **not confirmed** |
| Trivy | Real findings possible | Mock |
| Gitleaks | Real findings possible | Mock |
| OSV-Scanner | Real findings possible | Mock |
| HTTP headers / TLS inspect | Config/analysis path | Label as analysis |
| Strapi/Next heuristics | Config analysis | Unverified until reviewed |

**Report labeling required:** `real` | `mock` | `config_analysis` | `unverified`.

## Findings this review

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| SR-1 | Info | No live client E2E → remote AuthZ path not verified in prod | Track in live checklist |
| SR-2 | Medium (ops) | `/metrics` must not be world-open at edge | Nginx ACL + gateway AuthN |
| SR-3 | Medium (ops) | Single-process locks not multi-replica safe | Document; shared store later |
| SR-4 | Low | `npm audit` may report transitive issues | CI continue-on-error until remediated |
| SR-5 | Info | Placeholder domain `mcp.example.com` | Replace before expose |
| SR-6 | High if misconfig | Granting `oauth_allowed` + admin caps to remote client | Policy review mandatory |

No critical source bugs newly introduced identified in packaging review. Live exploit testing **not** performed.

## Remediation via GitOps/BuildOps

For code findings: feature branch → sandbox build/test → security re-scan → PR. No direct prod file edits. No auto firewall/SSH credential changes.

## Residual risk acceptance (operator)

- Mock scanners under-report/over-report vs real.
- Staging SSH still sensitive — treat staging like prod credentials hygiene.
- OAuth operator key is break-glass — store in vault; rotate.
