# global-server-mcp (`feat/bsd-global-mcp`)

**This branch = Brandstory Global only** (Next FE + Strapi BE).  
Live: `https://mcp.brandstoryglobal.com` · install `/opt/bsd-global-mcp` · [docs/BSD_GLOBAL_MCP.md](docs/BSD_GLOBAL_MCP.md)

Universal **MCP Platform** — policy-gated WebOps → DeployOps for multiple AI clients, projects, and stacks.

Works with **Cursor, Claude, ChatGPT, Grok, VS Code, Windsurf** (stdio or Streamable HTTP).  
**Protocol-compatible ≠ certified** — see [docs/clients/](docs/clients/).

## Features
- MCP over **stdio** (local) and **HTTP** (Streamable `/mcp` + legacy SSE `/sse`)
- **Fail-closed** API-key AuthN (`MCP_API_KEY` / Bearer / `X-API-Key`)
- **OAuth PKCE** with **operator consent** (no auto-approve); tokens → least-privilege principals
- **Default-deny** YAML policy (hosts, methods, capabilities, projects, environments)
- Tool discovery **filtered** by principal; AuthZ on every call
- **SSRF** guard (+ browser final-URL check), **rate limit**, **kill switch**, **audit** JSONL, **PII/URL redact**
- Principal-bound **browser sessions**
- Tools: module prefixes `http|page|session|code|git|build|server|db|security|deploy|platform` + `policy.explain` / `audit.tail`
- Config-driven **project registry** (`config/projects.yaml`) — no gateway core edits to add projects

## Quick start

```bash
cd /Users/brandstorydigital/Documents/projects/work/global-server-mcp
cp .env.example .env
# set MCP_API_KEY and MCP_OAUTH_OPERATOR_KEY
npm install
npx playwright install chromium
npm run build
```

### Local (Cursor) — stdio

`MCP_API_KEY` **required** (must match policy principal).

```bash
npm run dev
```

```json
{
  "mcpServers": {
    "global-server-mcp": {
      "command": "npx",
      "args": ["tsx", "/Users/brandstorydigital/Documents/projects/work/global-server-mcp/src/index.ts"],
      "env": {
        "MCP_API_KEY": "your-long-secret",
        "MCP_POLICY_PATH": "/Users/brandstorydigital/Documents/projects/work/global-server-mcp/config/policy.yaml"
      }
    }
  }
}
```

### Remote (Claude / ChatGPT / Grok / any HTTP MCP client)

```bash
npm run dev:http
# listens http://127.0.0.1:7337
```

| Endpoint | Use |
|---|---|
| `POST/GET/DELETE /mcp` | Streamable HTTP (modern clients) |
| `GET /sse` + `POST /messages` | Legacy HTTP+SSE |
| `GET /healthz` | Health (no auth, minimal) |
| `GET/POST /oauth/consent` | Operator OAuth consent |
| `GET /operators` | Dual-auth write approvals (human + `MCP_OPERATOR_TOKEN`) |

Auth header on every MCP request:

```
Authorization: Bearer <MCP_API_KEY>
```

or `X-API-Key: <MCP_API_KEY>`, or an OAuth access token issued after consent.

### Grok.com connectors (OAuth)

1. Set `MCP_PUBLIC_BASE_URL` to your ngrok HTTPS origin, `MCP_ALLOW_TUNNEL_HOSTS=1`, and `MCP_OAUTH_OPERATOR_KEY`
2. `npm run dev:http` + `ngrok http 7337`
3. Open `https://YOUR-TUNNEL/oauth/grok-setup` — copy fields into Grok form
4. When Grok redirects to authorize, open `/oauth/consent`, enter operator key, **Approve**

| Grok field | Value |
|---|---|
| Server URL | `https://YOUR-TUNNEL/mcp` |
| Client ID | `global-server-mcp-grok` |
| Client Secret | *(empty)* |
| Authorization Endpoint | `https://YOUR-TUNNEL/authorize` |
| Token Endpoint | `https://YOUR-TUNNEL/token` |
| Scopes | `mcp:tools` |
| Token Auth Method | none (PKCE only) |

Expose beyond localhost only behind TLS reverse proxy (`MCP_HTTP_HOST=0.0.0.0` + firewall).

## Policy
Edit `config/policy.yaml` or copy `config/policy.*.example.yaml`.  
Hosts/paths/repos via `projects` + principal `projects: [...]`. See [docs/SECURITY.md](docs/SECURITY.md).

## GitOps
GitHub App setup + write approval flow: [docs/GITOPS.md](docs/GITOPS.md) (ADR 006).

## BuildOps
Stack detect + isolated curated builds/tests: [docs/BUILDOPS.md](docs/BUILDOPS.md) (ADR 007). Docker preferred; no free-form shell.

## ServerOps
Multi-VPS registry + restricted SSH monitoring/maintenance: [docs/SERVEROPS.md](docs/SERVEROPS.md) (ADR 008). Read-only by default; approved actions only.

## DatabaseOps
PG/MySQL inspection + curated migrations: [docs/DATABASEOPS.md](docs/DATABASEOPS.md) (ADR 009). Read identity + READ ONLY txn; no free-form prod SQL.

## SecurityOps
Defensive AppSec/InfraSec scans: [docs/SECURITYOPS.md](docs/SECURITYOPS.md) (ADR 010). Registered targets only; unverified ≠ confirmed; no auto prod infra changes.

## DeployOps
Staging + human-gated production requests: [docs/DEPLOYOPS.md](docs/DEPLOYOPS.md) (ADR 011). AI cannot self-approve; prod dispatch off by default.

## Platform
Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (ADR 012).  
Clients: [docs/clients/](docs/clients/). Onboarding: [docs/onboarding/](docs/onboarding/).  
Checklist: [docs/PRODUCTION_READINESS_CHECKLIST.md](docs/PRODUCTION_READINESS_CHECKLIST.md).

## Production packaging (Phases 9–14)
- Docker: `Dockerfile` / `docker compose up` (non-root)
- CI: `.github/workflows/ci.yml`
- Edge: `deploy/nginx/mcp.example.com.conf` (placeholder domain)
- Reports: `PHASE9_14_IMPLEMENTATION_REPORT.md`, `MCP_PRODUCTION_READINESS.md`, `MCP_CLIENT_COMPATIBILITY_MATRIX.md`, `MCP_VPS_ONBOARDING_GUIDE.md`, `MCP_NEXTJS_STRAPI_INTEGRATION.md`, `MCP_SECURITY_REVIEW.md`, `MCP_LIVE_TEST_CHECKLIST.md`
- Keep `allow_production_dispatch: false` until live checklist signed

## Safety
Authorized targets only. Default deny. Least privilege. Human approval for privileged actions. Honest stack/client certification labels.

## Roadmap
See `progress.md`.
