# ChatGPT (custom MCP plugin)

**Status:** protocol (Streamable HTTP + OAuth PKCE / DCR). Verified only after live E2E.

## Add server

1. ChatGPT web → Plugins → **+** → **Add custom MCP server**  
   (or Connectors / Developer Mode, per account)
2. Server URL: `https://mcp.brandstoryglobal.com/mcp`
3. Auth: **OAuth**
4. If asked for Client ID: `global-server-mcp-chatgpt` · Client Secret: *(empty)*  
   Or leave Client ID blank when DCR is on (`MCP_OAUTH_ALLOW_DCR=1`)
5. Approve at `https://mcp.brandstoryglobal.com/oauth/consent` with `MCP_OAUTH_OPERATOR_KEY`
6. Install plugin → use with `@` in chat

Setup JSON: `https://mcp.brandstoryglobal.com/oauth/chatgpt-setup`  
All clients: `https://mcp.brandstoryglobal.com/oauth/setup`

Redirects allowlisted:
- `https://chatgpt.com/connector_platform_oauth_redirect`
- `https://chatgpt.com/connector/oauth/*` (prefix)

Tokens bind to `oauth-remote`. Never share `MCP_OPERATOR_TOKEN` with ChatGPT.
