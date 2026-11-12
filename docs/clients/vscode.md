# VS Code (MCP extension)

**Status:** protocol (stdio).

Configure the MCP extension / `mcp.json` similarly to Cursor:

```json
{
  "servers": {
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

Exact schema may vary by extension version — adapt keys accordingly.
