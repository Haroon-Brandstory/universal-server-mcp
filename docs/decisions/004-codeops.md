# ADR 004 — CodeOps adapter

## Decision
Add policy-gated filesystem tools (`code.list|read|edit|write|search`) scoped to principal `allow_paths`.

## Why
WebOps alone cannot change homepage meta titles / source. Agents need CodeOps for FE+BE repos (e.g. `global-brandstory`, `bsd-strapi`).

## Guards
- Default deny without `allow_paths`
- Realpath + root containment (symlink escape blocked)
- Block `.env*`, keys, `node_modules`, `.git`
- Writes require `write: true` + capability
- Size caps on read/write
- No shell / eval

## Consequences
- Operator must list absolute project roots in `config/policy.yaml`
- Restart MCP after capability changes for connected clients to rediscover tools
