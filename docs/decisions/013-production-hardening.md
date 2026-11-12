# ADR 013 — Production hosting, CI, and certification (Phases 9–14)

## Status
Accepted (2026-11-12)

## Context
Phases 1–8 delivered policy-gated modules. Production use needs packaging, CI, TLS edge, client honesty matrix, onboarding templates, and evidence-based readiness — without rebuilding the gateway.

## Decision
- Ship Docker (non-root) + compose + systemd unit + Nginx TLS template for `mcp.example.com`.
- Add GitHub Actions CI: typecheck, tests, build, secret scan, docker smoke.
- Keep `allow_production_dispatch: false` until operator signs live checklist.
- Client/stack status: protocol / supported / verified only with evidence.
- Workflow gates encoded in `workflowPipeline.ts` (fixture-validated).
- Onboard Next.js/Strapi via registry templates — never hardcode into gateway core.

## Consequences
Operators can host gateway as reusable infra. Live VPS/GitHub/client certification remains operator-gated. No automatic production deploys.
