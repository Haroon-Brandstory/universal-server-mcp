# global-server-mcp

Policy-gated **MCP gateway** for Brandstory Global WebOps → DeployOps.

AI clients (Cursor, Claude, ChatGPT, Grok, VS Code, Windsurf) connect over **stdio** or **Streamable HTTP**. Every tool call goes through AuthN → AuthZ → audit. Adapters stay thin; security lives in the gateway.

| | |
|---|---|
| **Branch** | `feat/bsd-global-mcp` — **Brandstory Global only** (do not add other sites) |
| **Public MCP** | `https://mcp.brandstoryglobal.com` |
| **Install root (VPS)** | `/opt/bsd-global-mcp` |
| **Node** | `>= 20` |
| **Version** | `0.1.0` |

**Frontend:** Next.js → VPS `/var/www/html/global-brandstory` · local `…/work/global-brandstory`  
**Backend:** Strapi → VPS `/var/www/html/global-backend/bsd-strapi` · local `…/work/bsd-strapi`

Deep site lock + live flows: [docs/BSD_GLOBAL_MCP.md](docs/BSD_GLOBAL_MCP.md)

---

## Current status

**Phases 1–14 implemented** (modules + platform + production packaging). Live droplet bring-up still open.

| Area | Status |
|---|---|
| Gateway spine (policy, SSRF, rate limit, audit, kill switch) | Done |
| Transports (stdio, Streamable HTTP `/mcp`, legacy SSE) | Done |
| Dual-auth operator UI (`/operators`) | Done |
| OAuth PKCE + operator consent | Done |
| Modules: WebOps → DeployOps + Platform | Done (Phases 2–8) |
| Docker / Nginx / CI packaging (Phases 9–14) | Done |
| Docker compose for DigitalOcean | Done (`deploy/docker/docker-compose.bsd-global.yml`) |
| Live `mcp.brandstoryglobal.com` (Docker + TLS) | **Next** — see checklist below |
| First verified client E2E on this site | **Next** |
| `allow_production_dispatch` | **Must stay `false`** until live checklist signed |

**Honest labels:** protocol-compatible ≠ verified. Client matrix: [docs/clients/](docs/clients/). Scorecard: [MCP_PRODUCTION_READINESS.md](MCP_PRODUCTION_READINESS.md). Tracker: [progress.md](progress.md).

### Remaining go-live checklist

1. Droplet: Docker up + nginx/certbot for `mcp.brandstoryglobal.com`
2. Smoke `healthz` + `/operators` + Cursor Bearer `MCP_API_KEY`
3. Record first verified client E2E (this site only)
4. Optional: Strapi PG readonly env for DatabaseOps

---

## What it does

- **Default deny** — no host / capability / path / project → deny
- **Auth fail-closed** — never soft-allow anonymous stdio/HTTP
- **API key AuthN** — `MCP_API_KEY` / `Authorization: Bearer` / `X-API-Key`
- **OAuth PKCE** — operator consent required; tokens only to `oauth_allowed` principals
- **Tool discovery filtered** by principal; AuthZ on every call
- **SSRF** guard (+ browser final-URL check), rate limit, kill switch, audit JSONL, PII/URL redact
- **Principal-bound** browser sessions (no cross-principal access)
- **Dual-auth writes** — AI requests (`*.approval.create`) → human approves at `/operators` → tool runs with `approvalId`
- **Config-driven projects** — `config/projects.yaml` (no gateway core edits to add projects)

### Module map

| Module | Tool prefix | Registry |
|---|---|---|
| WebOps | `http.*` `page.*` `session.*` | policy hosts |
| CodeOps | `code.*` | `allow_paths` |
| GitOps | `git.*` | `github_repos` |
| BuildOps | `build.*` | project.build |
| ServerOps | `server.*` | `config/servers.yaml` |
| DatabaseOps | `db.*` | `config/databases.yaml` |
| SecurityOps | `security.*` | `config/security.yaml` |
| DeployOps | `deploy.*` | `config/deployments.yaml` |
| Platform | `platform.*` `policy.explain` `audit.tail` | projects / stack-profiles |

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Prerequisites

- Node.js **20+**
- npm
- Chromium for Playwright browser tools: `npx playwright install chromium`
- For production VPS: Docker + Compose plugin, host Nginx, DNS for `mcp.brandstoryglobal.com`

---

## Installation (local)

```bash
git clone <repo-url> global-server-mcp
cd global-server-mcp
git checkout feat/bsd-global-mcp

cp .env.example .env
# Edit .env — set at least:
#   MCP_API_KEY              (≥16 chars) — AI / Cursor
#   MCP_OAUTH_OPERATOR_KEY   — OAuth consent
#   MCP_OPERATOR_TOKEN       — humans only at /operators (never give to AI)

npm install
npx playwright install chromium
npm run build
```

### Required env (minimum)

| Variable | Who uses it | Notes |
|---|---|---|
| `MCP_API_KEY` | Cursor / bots | Must match a principal key in `config/policy.yaml` |
| `MCP_OPERATOR_TOKEN` | Humans at `/operators` | Never put in chat or tool args |
| `MCP_OAUTH_OPERATOR_KEY` | OAuth consent page | Required for remote OAuth |
| `MCP_POLICY_PATH` | Gateway | Default `./config/policy.yaml` |

Full variable list: [`.env.example`](.env.example)

**Never set** `MCP_ALLOW_DEV_SELF_APPROVE=true` outside local tests.

---

## Setup — local Cursor (stdio)

Best for laptop CodeOps against local FE/BE checkouts.

```bash
npm run dev
```

Cursor MCP config (adjust absolute paths to your machine):

```json
{
  "mcpServers": {
    "global-server-mcp": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/global-server-mcp/src/index.ts"],
      "env": {
        "MCP_API_KEY": "your-long-secret",
        "MCP_POLICY_PATH": "/ABSOLUTE/PATH/TO/global-server-mcp/config/policy.yaml"
      }
    }
  }
}
```

`MCP_API_KEY` must match a principal in `config/policy.yaml`. Local paths for FE/BE are already listed under `brandstory-fe` / `brandstory-be` in `config/projects.yaml`.

Client guide: [docs/clients/cursor.md](docs/clients/cursor.md)

---

## Setup — remote HTTP (dev)

```bash
npm run dev:http
# default: http://127.0.0.1:7337
```

| Endpoint | Purpose |
|---|---|
| `POST/GET/DELETE /mcp` | Streamable HTTP (modern clients) |
| `GET /sse` + `POST /messages` | Legacy HTTP+SSE |
| `GET /healthz` | Health (no auth, minimal) |
| `GET/POST /oauth/consent` | Operator OAuth consent |
| `GET /operators` | Dual-auth write approvals |

Auth on every MCP request:

```http
Authorization: Bearer <MCP_API_KEY>
```

Also accepted: `X-API-Key: <MCP_API_KEY>`, or an OAuth access token after consent.

Production-style HTTP:

```bash
npm run build
npm run start:http    # MCP_TRANSPORT=http
# or
npm run start:prod    # NODE_ENV=production + HTTP
```

Expose beyond localhost only behind TLS reverse proxy (`MCP_HTTP_HOST=0.0.0.0` + firewall). Prefer tunnel tools (`cloudflared` / `ngrok`) for temporary remote testing.

### Grok.com connectors (OAuth)

1. Set `MCP_PUBLIC_BASE_URL` to your tunnel HTTPS origin, `MCP_ALLOW_TUNNEL_HOSTS=1`, and `MCP_OAUTH_OPERATOR_KEY`
2. `npm run dev:http` + tunnel to port `7337`
3. Open `https://YOUR-TUNNEL/oauth/grok-setup` — copy fields into Grok
4. When Grok hits authorize, open `/oauth/consent`, enter operator key, **Approve**

| Grok field | Value |
|---|---|
| Server URL | `https://YOUR-TUNNEL/mcp` |
| Client ID | `global-server-mcp-grok` |
| Client Secret | *(empty)* |
| Authorization Endpoint | `https://YOUR-TUNNEL/authorize` |
| Token Endpoint | `https://YOUR-TUNNEL/token` |
| Scopes | `mcp:tools` |
| Token Auth Method | none (PKCE only) |

### Claude / ChatGPT / Cursor (OAuth) — universal

Catalog: `https://YOUR-ORIGIN/oauth/setup`

| AI | Client ID | Setup |
|---|---|---|
| Claude | `global-server-mcp-claude` | `/oauth/claude-setup` |
| ChatGPT | `global-server-mcp-chatgpt` | `/oauth/chatgpt-setup` |
| Cursor | `global-server-mcp-cursor` | `/oauth/cursor-setup` |
| Grok | `global-server-mcp-grok` | `/oauth/grok-setup` |

Server URL always `https://YOUR-ORIGIN/mcp`. Client Secret empty. Approve at `/oauth/consent`.

ChatGPT: Plugins → Add custom MCP → OAuth. DCR on when `MCP_OAUTH_ALLOW_DCR=1` (bsd-global compose).

Guides: [universal-oauth.md](docs/clients/universal-oauth.md) · [claude.md](docs/clients/claude.md) · [chatgpt.md](docs/clients/chatgpt.md)

---

## Setup — production (DigitalOcean Docker)

Preferred path for `mcp.brandstoryglobal.com`. Full runbook: **[docs/DOCKER_DO_DEPLOY.md](docs/DOCKER_DO_DEPLOY.md)**

Summary:

1. DNS `mcp` A → droplet
2. Install Docker + Compose on droplet
3. Sync/clone this repo → `/opt/bsd-global-mcp`
4. Secrets: copy `deploy/env.bsd-global.example` → `/etc/bsd-global-mcp/env` (chmod `600`)
5. Start:

```bash
cd /opt/bsd-global-mcp
docker compose -f deploy/docker/docker-compose.bsd-global.yml \
  --env-file /etc/bsd-global-mcp/env \
  up -d --build

curl -fsS http://127.0.0.1:7337/healthz
```

6. Host Nginx + Certbot (gateway listens `127.0.0.1:7337` only):

```bash
sudo cp deploy/nginx/mcp.brandstoryglobal.com.conf \
  /etc/nginx/sites-available/mcp.brandstoryglobal.com.conf
sudo ln -sf /etc/nginx/sites-available/mcp.brandstoryglobal.com.conf \
  /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mcp.brandstoryglobal.com
curl -fsS https://mcp.brandstoryglobal.com/healthz
```

7. Cursor / remote clients:
   - URL: `https://mcp.brandstoryglobal.com/mcp`
   - Header: `Authorization: Bearer <MCP_API_KEY>`
   - Approvals: `https://mcp.brandstoryglobal.com/operators` + `MCP_OPERATOR_TOKEN`

### Live CodeOps + Next.js go-live

1. `code.approval.create` → approve at `/operators` → `code.edit` / `code.write` + `approvalId` (FE/BE roots only)
2. `server.approval.create` → approve → `maintenance.run` `nextjs.build` → `server.service.restart` `nextjs` on `brandstory-fe-vps`
3. PM2 from Docker: run `deploy/host/install-pm2-bridge.sh` once; approved restart uses host systemd bridge — **never** mount host `/usr/bin` on container PATH

Host app dirs must be group-writable by `www-data` (gid 33). Details in [DOCKER_DO_DEPLOY.md](docs/DOCKER_DO_DEPLOY.md).

Operator flow: [docs/OPERATORS.md](docs/OPERATORS.md)

---

## npm scripts

| Command | Use |
|---|---|
| `npm run dev` | Local stdio MCP (tsx) — Cursor |
| `npm run dev:http` | Local HTTP on `MCP_HTTP_HOST:MCP_HTTP_PORT` (default `127.0.0.1:7337`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Production stdio |
| `npm run start:http` | Production HTTP |
| `npm run start:prod` | `NODE_ENV=production` + HTTP |
| `npm test` | Unit / fixture tests |
| `npm run ci` | typecheck + test + build |
| `npm run docker:build` | Build image `bsd-global-mcp:latest` |
| `npm run docker:up` | Generic `docker compose up` |
| `npm run docker:up:bsd` | BSD Global compose with `/etc/bsd-global-mcp/env` |

---

## Policy & config

| File | Role |
|---|---|
| `config/policy.yaml` | Principals, capabilities, ops policy |
| `config/projects.yaml` | Brandstory FE/BE registry (hosts, paths, repos) |
| `config/servers.yaml` | ServerOps targets |
| `config/databases.yaml` | DatabaseOps targets |
| `config/security.yaml` | SecurityOps targets |
| `config/deployments.yaml` | DeployOps targets |
| `config/stack-profiles.yaml` | Stack support honesty labels |
| `config/policy.*.example.yaml` | Env-specific policy starters |

Edit policy carefully — default deny. Threat model: [docs/SECURITY.md](docs/SECURITY.md)

---

## Layout

```
src/gateway.ts              MCP server + tool dispatch
src/transport/httpServer.ts Streamable HTTP + SSE
src/policy/                 Allow/deny decisions
src/security/               SSRF, rate limit, redact
src/adapters/*              Execution (thin)
src/platform/               Registry + observability
config/                     Policy + module registries
deploy/docker/              BSD Global compose
deploy/nginx/               TLS edge configs
deploy/host/                PM2 restart bridge scripts
docs/                       Ops + ADRs + client guides
```

Agent rules for this repo: [AGENTS.md](AGENTS.md)

---

## Documentation index

| Doc | Topic |
|---|---|
| [docs/BSD_GLOBAL_MCP.md](docs/BSD_GLOBAL_MCP.md) | This branch scope + live URLs |
| [docs/DOCKER_DO_DEPLOY.md](docs/DOCKER_DO_DEPLOY.md) | DigitalOcean Docker deploy |
| [docs/OPERATORS.md](docs/OPERATORS.md) | Dual-auth approvals |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Platform design |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model |
| [docs/GITOPS.md](docs/GITOPS.md) | GitHub App + write approvals |
| [docs/BUILDOPS.md](docs/BUILDOPS.md) | Curated builds/tests |
| [docs/SERVEROPS.md](docs/SERVEROPS.md) | VPS monitoring / maintenance |
| [docs/DATABASEOPS.md](docs/DATABASEOPS.md) | PG/MySQL inspection + migrations |
| [docs/SECURITYOPS.md](docs/SECURITYOPS.md) | Defensive scans |
| [docs/DEPLOYOPS.md](docs/DEPLOYOPS.md) | Staging / gated prod deploys |
| [docs/clients/](docs/clients/) | Per-client connection guides |
| [docs/onboarding/](docs/onboarding/) | New project / VPS / DB / deploy |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures |
| [MCP_LIVE_TEST_CHECKLIST.md](MCP_LIVE_TEST_CHECKLIST.md) | Live test checklist |
| [MCP_CLIENT_COMPATIBILITY_MATRIX.md](MCP_CLIENT_COMPATIBILITY_MATRIX.md) | Client certification honesty |
| [progress.md](progress.md) | Done / next |

---

## Safety rules (non-negotiable)

- Authorized targets only (sites/APIs/repos/servers you own or have permission for)
- Secrets via env/vault only — never in tool args, chat, or audit bodies
- No unrestricted `eval`, raw shell, cookie dump, or arbitrary remote shell tools
- No free-form prod SQL; curated migrations + approvals only
- AI cannot self-approve production; no CI bypass; prod dispatch off by default
- ServerOps: no root SSH automation; no auto agent install / SSH config mutation on VPS
- Keep `allow_production_dispatch: false` until live checklist signed

---

## License

MIT
