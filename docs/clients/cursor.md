# Cursor

**Status:** protocol (stdio). Local verification when `MCP_API_KEY` matches policy.

```json
{
  "mcpServers": {
    "global-server-mcp": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/global-server-mcp/src/index.ts"],
      "env": {
        "MCP_API_KEY": "your-long-secret",
        "MCP_POLICY_PATH": "/ABSOLUTE/PATH/global-server-mcp/config/policy.yaml"
      }
    }
  }
}
```

Notes:
- Principal = `local-dev` (or whichever key matches)
- Tool discovery filtered by capabilities
- Browser sessions bound to principal
