# ADR 011 — DeployOps human-gated releases

## Decision
Add DeployOps with a deployment registry, provider adapters (GitHub Actions + VPS first), immutable history, conflicting-deploy locks, and human-only production/rollback approvals bound to project/environment/SHA/workflow. Production provider dispatch defaults off (`allow_production_dispatch: false`).

## Why
Agents may prepare and stage releases, but production must require a distinct human approver and must not bypass CI or embed secrets in prompts.

## Consequences
- AI cannot approve its own deploy
- Profiles are data-driven (Next/Strapi/etc. not hardcoded in gateway)
- VPS actions are curated argv only
- Docker/PM2/systemd/Vercel providers stub to mock until implemented+tested
