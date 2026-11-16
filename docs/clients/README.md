# AI Client Connection Guides

**Protocol compatibility ≠ verified end-to-end.**  
Status legend: `protocol` = MCP-compatible pattern documented; `verified` = tested in this environment.

| Client | Transport | Auth | Status |
|---|---|---|---|
| Cursor | stdio / HTTP OAuth | `MCP_API_KEY` or OAuth | protocol |
| Grok | Streamable HTTP + OAuth PKCE | OAuth → `oauth-remote` | protocol |
| Claude | stdio / custom connector OAuth | API key / OAuth | protocol |
| ChatGPT | Streamable HTTP + OAuth / DCR | OAuth → `oauth-remote` | protocol |
| VS Code | stdio (MCP extension) | API key | protocol |
| Windsurf | stdio | API key | protocol |
| Other MCP clients | stdio or `/mcp` | key / OAuth / DCR | protocol |

Universal catalog: `/oauth/setup` — see [universal-oauth.md](./universal-oauth.md).

Always use **least-privilege principals** for remote clients. Never map OAuth to `local-dev`.
