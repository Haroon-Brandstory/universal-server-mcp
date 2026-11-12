# ADR 005 — Phase 1 security hardening

## Decision
Harden the existing gateway in place: fail-closed AuthN, operator OAuth consent, durable hashed token store, principal-bound browser sessions, filtered tool discovery, read/write/admin capability classes, project/environment policy scopes.

## Why
Audit findings (auto-approve OAuth → local-dev, shared browser sessions, unfiltered tools/list) blocked safe multi-client remote use. Rebuild unnecessary — spine already correct.

## Consequences
- Stdio requires valid `MCP_API_KEY` (no soft allow)
- OAuth: `/oauth/consent` + `MCP_OAUTH_OPERATOR_KEY`; tokens bind to `oauth_allowed` principals only
- DCR off unless policy + `MCP_OAUTH_ALLOW_DCR=1`
- Tokens persisted under `MCP_OAUTH_STORE_PATH` (sha256 at rest)
- Playwright final URL re-validated for SSRF/host policy
- Policy examples: development / staging / production
