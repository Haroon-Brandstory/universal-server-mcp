# MCP VPS Onboarding Guide (ServerOps)

**Scope:** Restricted non-root diagnostics + approved maintenance.  
**Do not:** open arbitrary shell to AI; use root SSH automation; change firewall/SSH without explicit operator authorization.

Related: `docs/onboarding/vps.md`, `config/templates/server-vps.yaml.example`, ADR 008.

---

## 1. Register the host

1. Copy `config/templates/server-vps.yaml.example` into `config/servers.yaml`.
2. Set unique `id`, `host`, `user: mcp-ops`, environment (`staging` first).
3. Point `private_key_env` / `known_hosts_env` to env var **names** (not key material in YAML).
4. Link `project_ids` to `config/projects.yaml` entries.
5. Restrict `allow_maintenance` to minimal set (e.g. `cache.clear`, named service restarts).

## 2. Provision `mcp-ops` on the VPS (operator runbook)

On the **target** VPS (operator shell — not via MCP):

```bash
sudo useradd -r -m -s /bin/bash mcp-ops
sudo mkdir -p /home/mcp-ops/.ssh
# Install operator-generated public key only
sudo tee /home/mcp-ops/.ssh/authorized_keys </path/to/mcp-ops.pub
sudo chmod 700 /home/mcp-ops/.ssh
sudo chmod 600 /home/mcp-ops/.ssh/authorized_keys
sudo chown -R mcp-ops:mcp-ops /home/mcp-ops/.ssh
```

Grant **least privilege** for diagnostics (examples — adjust per distro):

- Read access to app log dirs via `ACL` or group (not world-readable secrets).
- Permission to run specific `systemctl status` / `restart` via sudoers **command allowlist** only if maintenance enabled.
- Prefer PM2/systemd status as the owning user without broad sudo.

**Sudoers sketch (operator review required):**

```
mcp-ops ALL=(root) NOPASSWD: /bin/systemctl status nginx, /bin/systemctl restart nginx
```

Never: `ALL`, raw `/bin/bash`, unrestricted `systemctl`.

## 3. Host key verification

On the **gateway** host:

```bash
ssh-keyscan -H staging-vps.example.com >> /etc/global-server-mcp/known_hosts_example
# Export path contents into env named in servers.yaml (MCP_SSH_KNOWN_HOSTS_*)
```

Disable StrictHostKeyChecking=no. Adapter must use known_hosts.

## 4. Gateway env (names only)

| Env | Purpose |
|---|---|
| `MCP_SSH_KEY_EXAMPLE_STAGING` | PEM for `mcp-ops` |
| `MCP_SSH_KNOWN_HOSTS_EXAMPLE_STAGING` | known_hosts blob/path per adapter contract |

## 5. Allowed MCP operations

| Class | Examples | Gate |
|---|---|---|
| read | health, metrics, services, logs.read, ssl.status, disk, processes | capability + server_id |
| write | service.restart, cache.clear, maintenance.run | approval + allow_maintenance |
| forbidden | arbitrary argv, root login, agent install, SSH config mutate | hard deny |

## 6. Frontend / backend topology

Do **not** assume FE and BE share a VPS. Register separate `server` entries when hosts differ. Bind each to the correct project id.

## 7. Validation (safe)

1. Mock transport tests (CI) — already cover argv allowlists.
2. Staging only: `server.list` → `server.health` with operator present.
3. Confirm audit JSONL lines for allow/deny.
4. Confirm cross-project server_id denied.

## 8. Blocked without operator

- Live SSH to production.
- Firewall changes.
- Installing MCP agents on VPS.
- Password-based SSH.
