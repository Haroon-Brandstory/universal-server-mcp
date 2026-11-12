# Phase 4 Implementation Report — ServerOps

**Date:** 2026-11-12  
**Constraint:** No connection to / alteration of production VPS during implementation. Mock transport only in tests.

## Summary

ServerOps adds multi-server registry, restricted SSH (or mock) adapter, read-only health/metrics tools, and approval-controlled maintenance. Compatible with Cursor/Grok/Claude via existing stdio + HTTP MCP surface.

## Delivered

| Item | Location |
|---|---|
| Registry + access control | `src/adapters/server/registry.ts`, `config/servers.yaml` |
| SSH + mock transport | `src/adapters/server/transport.ts` |
| Service profiles (Next/Strapi/nginx/pm2/…) | `src/adapters/server/profiles.ts` |
| Approvals / rate / locks | `approval.ts`, `controls.ts` |
| Operations | `src/adapters/server/operations.ts` |
| MCP tools | `definitions.ts` + `gateway.ts` |
| Policy | `serverops:` + principal caps in `config/policy*.yaml` |
| Fixtures / tests | `fixtures/serverops/`, `*.test.ts` |
| Docs | `docs/SERVEROPS.md`, ADR 008 |

## Tool surface

Read: `server.list`, `server.health`, `server.metrics`, `server.services`, `server.service.status`, `server.logs.read`, `server.ssl.status`, `server.disk.status`, `server.processes`, `server.security.status`.

Write (approved): `server.service.restart`, `server.cache.clear`, `server.maintenance.run`.

Admin: `server.approval.create`.

## Security posture

- Default deny; project + capability gated
- Non-root SSH; keys/known_hosts via env; no password automation
- Curated argv; no free-form shell; no unrestricted sudo
- Maintenance: server allowlist + approval + confirm server/env + rate limit + lock + before/after
- Outputs redacted/truncated; no key material in `server.list`
- Does not install agents or rewrite remote SSH config

## Limits / follow-ups

- Agent-based transport not implemented (SSH + mock only)
- SSL check uses `openssl s_client -brief` (registry hosts only)
- Concurrent lock is in-process (multi-replica needs shared lock store)
- Operator must provision non-root sudoers for allowed systemctl/nginx paths

## Ready for Phase 5 DeployOps?

**Yes**, after operator validates SSH keys + known_hosts on non-prod hosts. Do not enable maintenance write caps on production principals by default.
