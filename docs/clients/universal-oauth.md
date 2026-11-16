# Universal remote AI OAuth

One gateway, many AI clients. Consent always required.

## Catalog

| AI | Client ID | Setup |
|---|---|---|
| Grok | `global-server-mcp-grok` | `/oauth/grok-setup` |
| Claude | `global-server-mcp-claude` | `/oauth/claude-setup` |
| ChatGPT | `global-server-mcp-chatgpt` | `/oauth/chatgpt-setup` |
| Cursor (OAuth) | `global-server-mcp-cursor` | `/oauth/cursor-setup` |
| All | — | `/oauth/setup` |

Server URL for all: `https://YOUR-ORIGIN/mcp`

## Auth modes

1. **Bearer** `MCP_API_KEY` — Cursor stdio/remote header, bots
2. **Static OAuth client** — paste Client ID (secret empty, PKCE)
3. **DCR** — client self-registers; redirect must be allowlisted (exact or HTTPS prefix)

DCR requires `policy.oauth.allow_dynamic_registration: true` **and** `MCP_OAUTH_ALLOW_DCR=1`.

## Operator

Every OAuth connect → `/oauth/consent` + `MCP_OAUTH_OPERATOR_KEY`.  
Write approvals → `/operators` + `MCP_OPERATOR_TOKEN`.

## Add another AI later

1. Add client + redirect in `src/auth/oauthClients.ts`
2. Map id → `oauth-remote` in `config/policy.yaml`
3. Redeploy
