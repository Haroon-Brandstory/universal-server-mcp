# DigitalOcean Docker deploy — mcp.brandstoryglobal.com

Assumes:
- Droplet has Docker + Compose plugin
- DNS `mcp.brandstoryglobal.com` → droplet IP (you said done)
- Apps already on host:
  - `/var/www/html/global-brandstory`
  - `/var/www/html/global-backend/bsd-strapi`
- Nginx on host (not in this compose)

Gateway listens **only** `127.0.0.1:7337` (host network). Nginx terminates TLS.

---

## 1. Install Docker (once)

```bash
# Debian/Ubuntu droplet
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# re-login, then:
docker version
docker compose version
```

---

## 2. Put repo on droplet

```bash
sudo mkdir -p /opt/bsd-global-mcp /etc/bsd-global-mcp /var/lib/bsd-global-mcp
sudo chown "$USER":"$USER" /opt/bsd-global-mcp

# from laptop (run in repo root on feat/bsd-global-mcp):
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .env --exclude data --exclude logs --exclude dist \
  ./ USER@DROPLET_IP:/opt/bsd-global-mcp/
```

Or `git clone` / `git pull` into `/opt/bsd-global-mcp` on that branch.

---

## 3. Secrets file

```bash
sudo cp /opt/bsd-global-mcp/deploy/env.bsd-global.example /etc/bsd-global-mcp/env
sudo nano /etc/bsd-global-mcp/env
```

Must set (≥16 chars each):

```bash
MCP_API_KEY=...                 # Cursor / AI bot
MCP_OPERATOR_TOKEN=...          # humans only → /operators
MCP_OAUTH_OPERATOR_KEY=...      # OAuth consent if needed
MCP_PUBLIC_BASE_URL=https://mcp.brandstoryglobal.com
MCP_ALLOWED_HOSTS=mcp.brandstoryglobal.com
```

Keep `MCP_ALLOW_TUNNEL_HOSTS=0`. Never set `MCP_ALLOW_DEV_SELF_APPROVE` on VPS.

```bash
sudo chmod 600 /etc/bsd-global-mcp/env
```

Compose mounts this via `env_file: /etc/bsd-global-mcp/env`.

---

## 4. Build + run container

```bash
cd /opt/bsd-global-mcp
docker compose -f deploy/docker/docker-compose.bsd-global.yml \
  --env-file /etc/bsd-global-mcp/env \
  up -d --build

docker ps
curl -fsS http://127.0.0.1:7337/healthz
docker logs -f bsd-global-mcp
```

Update after git pull:

```bash
cd /opt/bsd-global-mcp
git pull   # or rsync again
docker compose -f deploy/docker/docker-compose.bsd-global.yml \
  --env-file /etc/bsd-global-mcp/env \
  up -d --build
```

Stop:

```bash
docker compose -f deploy/docker/docker-compose.bsd-global.yml down
```

---

## 5. Nginx + TLS (host)

```bash
sudo cp /opt/bsd-global-mcp/deploy/nginx/mcp.brandstoryglobal.com.conf \
  /etc/nginx/sites-available/mcp.brandstoryglobal.com.conf
sudo ln -sf /etc/nginx/sites-available/mcp.brandstoryglobal.com.conf \
  /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# DNS already pointed:
sudo certbot --nginx -d mcp.brandstoryglobal.com
```

Smoke:

```bash
curl -fsS https://mcp.brandstoryglobal.com/healthz
# Browser: https://mcp.brandstoryglobal.com/operators
```

If `limit_req_zone` already defined elsewhere, nginx may error — delete duplicate zone lines from the site conf or move zones into `nginx.conf`.

---

## 6. Cursor / AI client

- Server URL: `https://mcp.brandstoryglobal.com/mcp`
- Header: `Authorization: Bearer <MCP_API_KEY>`

Approvals: `https://mcp.brandstoryglobal.com/operators` + `MCP_OPERATOR_TOKEN` (never in chat).

---

## 7. What Docker mounts

| Mount | Why |
|---|---|
| `config/:ro` | policy / projects / servers |
| named volume `/data` | audit, oauth store, metrics |
| `/var/www/html/global-brandstory:rw` | Live CodeOps FE |
| `/var/www/html/global-backend/bsd-strapi:rw` | Live CodeOps BE |
| `network_mode: host` | hit Next `:3000` / Strapi `:1337` on same box |
| `group_add: ["33"]` | www-data gid — write into group-writable app dirs |

### Host perms (required for live edits)

Container UID `10001` + group `www-data` (33). Make app trees group-writable:

```bash
sudo chgrp -R www-data /var/www/html/global-brandstory /var/www/html/global-backend/bsd-strapi
sudo chmod -R g+rwX /var/www/html/global-brandstory /var/www/html/global-backend/bsd-strapi
# optional sticky group:
sudo find /var/www/html/global-brandstory /var/www/html/global-backend/bsd-strapi -type d -exec chmod g+s {} \;
```

OAuth clients (`oauth-remote`) get `code.write` / `code.edit` under `allow_paths` only. Prefer Cursor Bearer `MCP_API_KEY` for heavy edits. Git/deploy still need GitHub App + `/operators`.

---

## Troubleshoot

| Symptom | Check |
|---|---|
| container exit | `docker logs bsd-global-mcp` — missing `MCP_API_KEY` / operator token |
| healthz fail local | `ss -lntp \| grep 7337` — something else bound? |
| HTTPS 502 | nginx upstream → `127.0.0.1:7337`; container running? |
| Host rejected | `MCP_ALLOWED_HOSTS=mcp.brandstoryglobal.com` |
| code.list deny path | mounts match `projects.yaml` allow_paths |
| certbot fail | `dig +short mcp.brandstoryglobal.com` = droplet IP; ports 80/443 open |
