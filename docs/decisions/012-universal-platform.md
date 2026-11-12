# ADR 012 — Universal MCP platform consolidation

## Decision
Consolidate completed modules behind a configuration-driven project registry (`config/projects.yaml`), explicit module catalog, stack-profile honesty, platform observability (traceId + metrics), retry for safe reads, and emergency principal revocation — without rewriting the gateway spine or dropping existing features.

## Why
Operators need to onboard projects/clients/stacks without editing core dispatch, while keeping default-deny governance and clear “not certified until tested” semantics.

## Consequences
- `loadPolicy()` merges projects registry by id
- `platform.*` tools expose architecture/projects/metrics
- Client docs distinguish protocol vs verified
- `/metrics` is auth-gated; `/healthz` remains public-minimal
