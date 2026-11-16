# Claude (custom connector / remote OAuth)

**Status:** protocol (Streamable HTTP + OAuth PKCE). Verified only after live consent E2E.

## Remote custom connector

1. `MCP_PUBLIC_BASE_URL=https://mcp.brandstoryglobal.com` (or tunnel HTTPS)
2. `MCP_OAUTH_OPERATOR_KEY=...`
3. Open `https://YOUR-ORIGIN/oauth/claude-setup` — copy fields into Claude
4. Claude → Organization settings → Connectors → Add → Custom → Web
5. Server URL: `https://YOUR-ORIGIN/mcp`
6. OAuth client: **Use your own OAuth client**
7. Client ID: `global-server-mcp-claude` · Client Secret: *(empty)*
8. When Claude hits authorize, open `/oauth/consent`, enter operator key, **Approve**

| Claude field | Value |
|---|---|
| Server URL | `https://YOUR-ORIGIN/mcp` |
| Client ID | `global-server-mcp-claude` |
| Client Secret | *(empty)* |
| Redirect (server allowlist) | `https://claude.ai/api/mcp/auth_callback` |

Tokens bind to `oauth-remote` (read-mostly). Never `local-dev`.

## Desktop stdio (no OAuth)

See [claude-desktop.md](./claude-desktop.md) — Bearer/`MCP_API_KEY` via local process.
