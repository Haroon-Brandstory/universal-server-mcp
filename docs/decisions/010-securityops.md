# ADR 010 — SecurityOps defensive scans + findings workflow

## Decision
Add SecurityOps with a target registry, pluggable scanners (builtin + optional pinned CLIs), durable findings with confidence/verification, and remediation plans that may orchestrate GitOps/BuildOps but never auto-mutate production infrastructure.

## Why
Agents need authorized AppSec/InfraSec visibility without becoming an offensive scanner or silent infra changer.

## Consequences
- Only `config/security.yaml` targets are scannable
- External tools mocked when absent or `force_mock_scanners`
- Production: headers/TLS only unless `allow_production_scans`
- Findings default `unverified`; remediation execute refuses production
