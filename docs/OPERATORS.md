# Operator approvals (dual auth)

AI can **request** a change. A human must **approve** before the write runs.

## Flow

1. Agent calls `*.approval.create` (or `code.approval.create`) → `approvalId` with `status: pending`
2. Human opens **`/operators`** (e.g. `https://mcp.brandstoryglobal.com/operators`)
3. Sign in with **`MCP_OPERATOR_TOKEN`** (approval password — never give to the AI)
4. Click **Approve** (or Deny)
5. Tell the agent it is approved
6. Agent retries the write tool with that `approvalId`

### Live Next.js example

1. `code.approval.create` → approve → `code.edit` + `approvalId` (source on disk)
2. `server.approval.create` (`brandstory-fe-vps`, confirmEnvironment `production`) → approve
3. `server.maintenance.run` action `nextjs.build` + `approvalId`
4. `server.service.restart` service `nextjs` + new/same approved `approvalId` (uses left)

## Env

```bash
MCP_OPERATOR_TOKEN=long-random-secret-at-least-16-chars
MCP_PUBLIC_BASE_URL=https://mcp.example.com   # so agent messages show full URL
# NEVER in production:
# MCP_ALLOW_DEV_SELF_APPROVE=true
```

## Nginx

Proxy `/operators` to the gateway (see `deploy/nginx/mcp.example.com.conf`).

## Tools

| Tool | Role |
|---|---|
| `*.approval.create` | Create pending ticket |
| `approvals.list` | See pending / approved unused tickets |
| Write tools with `approvalId` | Consume only after operator approve |

No MCP tool accepts the operator password. UI only.
