# AI Client Connection Guides

**Protocol compatibility ≠ verified end-to-end.**  
Status legend: `protocol` = MCP-compatible pattern documented; `verified` = tested in this environment.

| Client | Transport | Auth | Status |
|---|---|---|---|
| Cursor | stdio | `MCP_API_KEY` | protocol (+ local verified when key set) |
| Grok | Streamable HTTP + OAuth PKCE | OAuth → `oauth-remote` | protocol (+ tunnel verified when configured) |
| Claude Desktop | stdio | API key env | protocol |
| Claude Code | stdio / HTTP | API key | protocol |
| ChatGPT | HTTP (where MCP supported) | Bearer | protocol |
| VS Code | stdio (MCP extension) | API key | protocol |
| Windsurf | stdio | API key | protocol |
| Other MCP clients | stdio or `/mcp` | key / OAuth | protocol |

Always use **least-privilege principals** for remote clients. Never map OAuth to `local-dev`.
