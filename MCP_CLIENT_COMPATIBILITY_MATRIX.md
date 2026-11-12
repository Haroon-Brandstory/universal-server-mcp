# MCP Client Compatibility Matrix

**Date:** 2026-11-12  
**Rule:** protocol ≠ verified. Verified only after recorded E2E (handshake + tools/list + read tool + deny write + session isolation).

| Client | Transport | Auth | Config doc | Handshake | Tool discovery | Read tool | Unauthorized deny | Session isolation | Status |
|---|---|---|---|---|---|---|---|---|---|
| Cursor | stdio | API key | `docs/clients/cursor.md` | Operator Verification Required | OVR | OVR | OVR | OVR | **protocol** |
| Grok / xAI | Streamable HTTP + OAuth PKCE | OAuth + consent | `docs/clients/grok.md` | OVR | OVR | OVR | OVR | OVR | **protocol** |
| Claude Desktop | stdio or HTTP (per app version) | API key / OAuth | `docs/clients/claude-desktop.md` | OVR | OVR | OVR | OVR | OVR | **protocol** |
| Claude Code | stdio / HTTP | API key | `docs/clients/claude-code.md` | OVR | OVR | OVR | OVR | OVR | **protocol** |
| ChatGPT | HTTP (where MCP supported) | OAuth/API per platform | `docs/clients/chatgpt.md` | OVR | OVR | OVR | OVR | OVR | **protocol** |
| VS Code | extension MCP | API key | `docs/clients/vscode.md` | OVR | OVR | OVR | OVR | OVR | **protocol** |
| Windsurf | MCP config | API key | `docs/clients/windsurf.md` | OVR | OVR | OVR | OVR | OVR | **protocol** |

OVR = Operator Verification Required.

## Remote production shape

```
Client → HTTPS Nginx (mcp.example.com) → 127.0.0.1:7337 MCP gateway
         TLS terminate                  AuthN on /mcp /sse /messages /metrics
         /healthz public
```

Placeholder domain only. Replace before go-live.

## Per-client principal guidance

| Client use | Principal pattern | Capabilities |
|---|---|---|
| Local Cursor | `local-dev` | Project-scoped read + limited write |
| Remote OAuth | `oauth-remote` / grok client id mapped | Never grant operator; no `oauth_allowed` on break-glass admin without consent process |
| CI bot (future) | dedicated principal | read-only preferred |

## Certification procedure

1. Connect with generated config from `docs/clients/*`.
2. Confirm `tools/list` subset matches policy (no admin leakage).
3. Call `policy.explain` or `platform.info` (read).
4. Attempt unauthorized tool → expect deny + audit.
5. Two principals → browser session cross-access must fail.
6. Record date, client version, gateway version, evidence path → then change status to **verified**.

## Troubleshooting (short)

| Symptom | Check |
|---|---|
| 401 on `/mcp` | Bearer key / OAuth token; principal mapping |
| OAuth consent loop | `MCP_OAUTH_OPERATOR_KEY`; operator must approve |
| Host rejected | `MCP_ALLOWED_HOSTS` / tunnel allow / Nginx `server_name` |
| Empty tool list | Principal capabilities empty or revoked |
| SSE stall | Nginx `proxy_buffering off`; long read timeouts |
