# SecurityOps

Defensive scanning for operator-registered projects, origins, and servers only.

## Tools

| Tool | Class | Purpose |
|---|---|---|
| `security.scan.code` | read | Builtin SAST + Semgrep (if installed) + framework heuristics |
| `security.scan.dependencies` | read | npm audit + OSV-Scanner |
| `security.scan.secrets` | read | Builtin patterns + Gitleaks |
| `security.scan.container` | read | Trivy on registry-allowlisted images only |
| `security.audit.server` | read | Passive ServerOps hardening checks |
| `security.audit.headers` | read | Security headers on allowlisted origins |
| `security.audit.tls` | read | Cert expiry / protocol checks |
| `security.findings` | read | List/filter; `setVerification` needs write |
| `security.remediation.plan` | write | Plan (+ optional GitOps/BuildOps execute) |

## Registry (`config/security.yaml`)

Each target: `project_id`, `environment`, `allowed_scans`, optional `scan_roots`, `http_origins`, `server_id`, `container_images`, `frameworks`.

Access = principal `projects` ∩ target. Scan roots must resolve under `allow_paths`.

## Findings schema

Every finding: `id`, `projectId`, `environment`, `severity`, `evidence` (redacted), `affected`, `impact`, `remediation`, `confidence`, `verification` (`unverified` by default).

**Unverified ≠ confirmed vulnerability.**

## Integrations (pinned expectations)

| Tool | Role | Behavior if missing |
|---|---|---|
| Semgrep | SAST | Mock finding |
| Gitleaks | Secrets | Mock finding |
| Trivy | Containers | Mock finding |
| OSV-Scanner | Deps | Mock finding |
| npm audit | Deps | Runs when npm present |

No invasive pen-tests. Production non-passive scans blocked unless `allow_production_scans: true`.

## Remediation workflow

1. Validate evidence (`security.findings` → `validated` / `false_positive`)
2. `security.remediation.plan` proposes steps
3. Optional `execute=true`: GitOps branch → BuildOps test → PR (approvals required)
4. Production release stays blocked — DeployOps / human approval
5. **Never** auto-change server security settings or prod infra

## Policy

```yaml
securityops:
  enabled: true
  targets_path: ./config/security.yaml
  findings_path: ./data/security-findings.json
  allow_production_scans: false
  force_mock_scanners: false
  max_findings_per_scan: 200
  scanner_timeout_sec: 120
```
