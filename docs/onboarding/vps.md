# VPS onboarding (ServerOps)

1. Create non-root user (e.g. `mcp-monitor`) with least sudoers for approved commands only
2. Install deploy helper at fixed path if using DeployOps VPS (`/usr/local/bin/mcp-deploy`) — operator-owned
3. Generate keypair; store private key path in env (`*_KEY_PATH`)
4. Pin host key in known_hosts file; set `*_KNOWN_HOSTS` env
5. Add server to `config/servers.yaml` (`method: ssh`, never `root`)
6. Link `server_ids` from `config/projects.yaml`
7. Grant principal ServerOps read caps; maintenance caps only if needed
8. Test with `method: mock` first — never auto-install agents or rewrite SSH config from MCP
