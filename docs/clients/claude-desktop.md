# Claude Desktop

**Status:** protocol (stdio). Not marked verified unless operator confirms in Claude Desktop UI.

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

Prefer a dedicated principal with least privilege for Claude Desktop if shared with Cursor.
