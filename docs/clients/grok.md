# Grok.com connectors

**Status:** protocol (Streamable HTTP + OAuth PKCE). Verified only when public HTTPS tunnel + consent flow exercised.

1. `MCP_PUBLIC_BASE_URL=https://YOUR.ngrok-free.dev`
2. `MCP_ALLOW_TUNNEL_HOSTS=1`
3. `MCP_OAUTH_OPERATOR_KEY=...`
4. `npm run dev:http` + `ngrok http 7337`
5. Open `/oauth/grok-setup` — paste into Grok form
6. Approve at `/oauth/consent` with operator key

Tokens bind to `oauth-remote` (read-mostly). Never `local-dev`.
