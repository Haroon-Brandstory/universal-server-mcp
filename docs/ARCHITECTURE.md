# Universal MCP Platform Architecture

## Overview

`global-server-mcp` is a **policy-gated MCP gateway**. AI clients connect via stdio or HTTP; every tool call passes AuthN → AuthZ → audit. Adapters execute work; security decisions stay in the gateway.

```mermaid
flowchart TB
  subgraph clients [AI Clients]
    Cursor
    Grok
    Claude
    VSCode
    Windsurf
  end

  subgraph transport [Transports]
    Stdio
    StreamableHTTP["Streamable HTTP /mcp"]
    SSE["Legacy SSE /sse"]
  end

  subgraph gateway [Gateway Spine]
    AuthN[AuthN fail-closed]
    AuthZ[Capability + project scope]
    Audit[Audit JSONL + metrics]
    Dispatch[Tool dispatch]
  end

  subgraph modules [Modules]
    WebOps
    CodeOps
    GitOps
    BuildOps
    ServerOps
    DatabaseOps
    SecurityOps
    DeployOps
  end

  subgraph config [Config registries]
    Policy[policy.yaml]
    Projects[projects.yaml]
    Servers[servers.yaml]
    DBs[databases.yaml]
    Sec[security.yaml]
    Deploy[deployments.yaml]
  end

  clients --> transport --> AuthN --> AuthZ --> Dispatch
  Dispatch --> Audit
  Dispatch --> modules
  AuthZ --> config
  modules --> config
```

## Design rules

1. **Default deny** — no host/capability/path/project → deny
2. **Thin adapters** — no duplicated authz/approval engines inside adapters
3. **Config-driven projects** — add a project via `config/projects.yaml` (+ related registries); do not edit gateway core
4. **Honest support status** — stack profiles mark `certified|supported|experimental|planned`
5. **Principal isolation** — sessions, build workspaces, browser contexts, credentials never shared across principals

## Module map

| Module | Prefix | Registry |
|---|---|---|
| WebOps | `http.*` `page.*` `session.*` | policy hosts |
| CodeOps | `code.*` | allow_paths |
| GitOps | `git.*` | github_repos |
| BuildOps | `build.*` | project.build |
| ServerOps | `server.*` | servers.yaml |
| DatabaseOps | `db.*` | databases.yaml |
| SecurityOps | `security.*` | security.yaml |
| DeployOps | `deploy.*` | deployments.yaml |
| Platform | `platform.*` | projects.yaml / stack-profiles.yaml |

## Extending

- **New project:** edit `config/projects.yaml` + link servers/db/security/deploy ids
- **New adapter capability:** types → definitions → `requireCap` in gateway → policy allowlist → audit
- **New module metadata:** `registerModule()` in `src/platform/modules.ts`

See also: [clients](./clients/), [onboarding](./onboarding/), [SECURITY.md](./SECURITY.md).
