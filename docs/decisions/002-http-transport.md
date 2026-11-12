# ADR 002 — Remote HTTP MCP transport

## Decision
Expose the same policy-gated gateway over Streamable HTTP (`/mcp`) plus legacy HTTP+SSE (`/sse` + `/messages`), in addition to stdio.

## Why
stdio only works for local hosts (Cursor). ChatGPT, Claude, Grok bots, and remote agents need a network MCP endpoint with API-key AuthN.

## Consequences
- `MCP_TRANSPORT=http` starts Express listener (default `127.0.0.1:7337`)
- HTTP Auth is strict: `Authorization: Bearer` or `X-API-Key` required
- Bind `0.0.0.0` only behind TLS reverse proxy; keep loopback for local multi-client
- OIDC/mTLS still deferred; API key is the remote AuthN MVP
