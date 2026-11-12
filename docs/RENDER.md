# Host MCP gateway on Render

**Do not create Postgres for the gateway.** Audit/OAuth state are files, not SQL.  
Create a **Web Service** from this repo’s `Dockerfile`.

## Render UI steps

1. Cancel **New Postgres** (unless you separately need a DB for Strapi later).
2. **New → Web Service**
3. Connect `Haroon-Brandstory/universal-server-mcp`
4. Runtime: **Docker** (auto from `Dockerfile`)
5. Instance: start small (free/starter); upgrade if Playwright/browser tools needed later
6. Health check path: `/healthz`
7. Add a **persistent disk** (recommended):
   - Mount path: `/data`
   - Size: 1 GB+
8. Deploy

## Environment variables (Render dashboard)

| Key | Value |
|---|---|
| `MCP_TRANSPORT` | `http` (**never** `stdio` on Render — causes instant exit) |
| `MCP_HTTP_HOST` | `0.0.0.0` (**never** `127.0.0.1`) |
| `MCP_API_KEY` | long random secret |
| `MCP_OAUTH_OPERATOR_KEY` | long random secret (OAuth consent) |
| `MCP_PUBLIC_BASE_URL` | `https://YOUR-SERVICE.onrender.com` |
| `MCP_ALLOW_TUNNEL_HOSTS` | `1` (allows `*.onrender.com` Host) |
| `MCP_ALLOWED_HOSTS` | `YOUR-SERVICE.onrender.com` (also set custom domain if any) |
| `MCP_POLICY_PATH` | `/app/config/policy.yaml` |
| `MCP_AUDIT_PATH` | `/data/logs/audit.jsonl` |
| `MCP_METRICS_PATH` | `/data/logs/metrics.jsonl` |
| `MCP_OAUTH_STORE_PATH` | `/data/oauth-store.json` |
| `MCP_KILL_SWITCH` | `0` |

**Do not set** `MCP_HTTP_PORT` on Render. Platform `PORT` must win.

### “Application exited early” checklist
1. `MCP_TRANSPORT=http` (not copied from local `stdio`)
2. `MCP_HTTP_HOST=0.0.0.0`
3. No `MCP_HTTP_PORT=7337` (conflicts with Render `PORT`)
4. Redeploy after latest `main` (PORT-aware listen)

Optional later: `GITHUB_APP_*`, SSH key envs, DB envs — only when wiring GitOps/ServerOps/DatabaseOps.

## After deploy

```bash
curl -fsS https://YOUR-SERVICE.onrender.com/healthz
```

Expect `"ok":true`.

Remote MCP URL: `https://YOUR-SERVICE.onrender.com/mcp`  
Auth: `Authorization: Bearer <MCP_API_KEY>`

OAuth (Grok): set `MCP_PUBLIC_BASE_URL` first; approve consent with operator key.

## Custom domain (optional)

1. Add domain in Render  
2. TLS automatic  
3. Update `MCP_PUBLIC_BASE_URL` + `MCP_ALLOWED_HOSTS`

## Limits / honesty

- Free tier sleeps — bad for always-on MCP; use paid instance for real use  
- No Docker-in-Docker on Render → BuildOps docker runner limited; prefer process runner only if policy allows non-prod  
- Keep `allow_production_dispatch: false`  
- Gateway on Render ≠ SSH into your app VPS until ServerOps keys configured  

## Not this screen

| Render type | For MCP gateway? |
|---|---|
| Web Service | **Yes** |
| Postgres | No (gateway) / Yes only for app DBs later |
| Static Site | No |
| Background Worker | No |
| Cron | No |
