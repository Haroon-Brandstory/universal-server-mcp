# Security operations guide

1. Register target in `config/security.yaml` (project + allowed_scans)
2. Keep `allow_production_scans: false` (headers/TLS only on prod)
3. Treat findings as **unverified** until validated
4. Mark `false_positive` / `accepted_risk` intentionally
5. Remediation: plan → GitOps PR → BuildOps tests — never auto-harden prod servers
6. Install Semgrep/Trivy/Gitleaks/OSV in CI if desired; otherwise mocks apply
