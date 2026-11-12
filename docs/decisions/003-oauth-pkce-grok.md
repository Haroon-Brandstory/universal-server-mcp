# ADR 003 — OAuth PKCE for grok.com connectors

## Decision
Ship an in-process OAuth 2.1 Authorization Server (PKCE public client) beside the MCP resource, using `@modelcontextprotocol/sdk` `mcpAuthRouter`.

## Why
`grok.com/connectors` requires OAuth (Client ID + authorize + token). Static Bearer API key works for Grok Bot / Cursor but not the website Connect Apps form.

## Details
- Issuer / public origin: `MCP_PUBLIC_BASE_URL` (ngrok HTTPS)
- Pre-registered client: `global-server-mcp-grok` → redirect `https://grok.com/connectors-oauth-exchange-code/`
- DCR enabled at `/register`
- MCP accepts Bearer API key **or** OAuth access token
- Setup helper: `GET /oauth/grok-setup`

## Consequences
- Tokens are in-memory (lost on restart)
- Auto-approve authorize (no login UI) — acceptable for operator-owned tunnel MVP
- Production should use durable store + real IdP / consent
