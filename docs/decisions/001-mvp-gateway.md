# ADR 001 — MVP gateway shape

## Decision
Ship a single TypeScript MCP gateway over stdio with YAML policy, SSRF guard, Playwright browser adapter, and fetch-based HTTP adapter.

## Why
Fast path for agents to operate allowlisted web UIs/APIs without per-framework runners. Security spine before feature sprawl.

## Consequences
- One runtime for MVP (Node 20+)
- Multi-language runners deferred
- Policy file is source of truth for allowlists
