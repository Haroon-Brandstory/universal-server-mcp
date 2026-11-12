# Troubleshooting

| Symptom | Check |
|---|---|
| `Authentication failed` | `MCP_API_KEY` matches principal; not in `revoked_principal_ids` |
| Empty tools list | Principal `capabilities` + write/admin flags |
| `not authorized` project/server/db | Principal `projects` includes id; registry `enabled` |
| OAuth binds wrong principal | `oauth.default_principal_id` / client map — never local-dev |
| Browser session denied | Session owned by other principal |
| Build fails sandbox | Docker available or `allow_process_runner` (non-prod) |
| SSH Root forbidden | Use non-root `user` in servers.yaml |
| Prod deploy dry-run only | `allow_production_dispatch: false` (expected) |
| Self-approval rejected | Approver principal ≠ requestor |
| CI gate failed | Pass `ciGreen: true` only after real CI green |
| Metrics empty | Call tools first; see `logs/metrics.jsonl` |
| Tunnel Host 403 | `MCP_ALLOW_TUNNEL_HOSTS=1` or `MCP_ALLOWED_HOSTS` |

Audit trail: `logs/audit.jsonl`. Kill switch: `MCP_KILL_SWITCH=1`.
