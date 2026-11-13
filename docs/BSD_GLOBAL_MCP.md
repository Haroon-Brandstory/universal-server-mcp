# BSD Global MCP — brandstory FE + BE only

Branch: `feat/bsd-global-mcp`  
Gateway: `mcp.brandstoryglobal.com` → Docker in `/opt/bsd-global-mcp`  
**Preferred install:** [DOCKER_DO_DEPLOY.md](./DOCKER_DO_DEPLOY.md)

| App | Stack | VPS path | Local path |
|---|---|---|---|
| Frontend | Next.js | `/var/www/html/global-brandstory` | `…/work/global-brandstory` |
| Backend | Strapi | `/var/www/html/global-backend/bsd-strapi` | `…/work/bsd-strapi` |

Operator approvals: `https://mcp.brandstoryglobal.com/operators`

## Quick path (Docker on DigitalOcean)

1. DNS `mcp` A → droplet (done)
2. Install Docker on droplet
3. Sync this repo → `/opt/bsd-global-mcp`
4. `/etc/bsd-global-mcp/env` from `deploy/env.bsd-global.example` (secrets)
5. `docker compose -f deploy/docker/docker-compose.bsd-global.yml --env-file /etc/bsd-global-mcp/env up -d --build`
6. Nginx site + `certbot -d mcp.brandstoryglobal.com`
7. `curl https://mcp.brandstoryglobal.com/healthz`

Full commands: **[docs/DOCKER_DO_DEPLOY.md](./DOCKER_DO_DEPLOY.md)**

## Cursor / Grok — live CodeOps (approval required)

- URL: `https://mcp.brandstoryglobal.com/mcp`
- Auth: OAuth or Bearer `MCP_API_KEY`
- **Every** live file write: `code.approval.create` → approve at `/operators` → `code.edit`/`code.write` + `approvalId`
- **Go live:** `server.approval.create` → approve → `maintenance.run` `nextjs.build` → `server.service.restart` `nextjs` (`brandstory-fe-vps`)
- PM2 from Docker: `deploy/host/install-pm2-bridge.sh` + compose `--env-file deploy/docker/.env.pm2` (see DOCKER_DO_DEPLOY.md)
- Host dirs group-writable by `www-data` (see DOCKER_DO_DEPLOY.md)
- Password: `MCP_OPERATOR_TOKEN` (never give to AI)
