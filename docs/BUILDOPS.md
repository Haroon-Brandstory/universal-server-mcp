# BuildOps

Isolated, stack-agnostic build/test execution for MCP agents.

## Tools

| Tool | Class | Purpose |
|---|---|---|
| `build.detect_stack` | read | Manifest-based stack detection |
| `build.list_tasks` | read | Curated approved tasks |
| `build.run` / `test` / `lint` / `typecheck` | write | Start isolated job |
| `build.status` / `logs` | read | Observe job |
| `build.cancel` | write | Abort job |
| `build.approval.create` | admin | Approve network/install |

## Isolation model

1. Copy project into `data/build-workspaces/<principal>/<jobId>/` (skips `node_modules`, `.git`, etc.)
2. Run curated `argv` only (never AI shell strings)
3. **Docker runner (default):** `--user 65534`, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, `--network none` (unless approved allowlist), memory/cpu/pids limits, **no docker.sock**, no host credential mounts
4. **Process runner:** explicit `build.allow_process_runner: true` and not production; still no shell; cannot run network tasks

## Project config (`policy.projects[].build`)

```yaml
build:
  language: javascript          # optional override / documentation
  framework: nextjs
  runtime_version: "20"
  package_manager: npm
  network: none                 # or allowlist
  network_allowlist: []
  approved_tasks: [node.test, node.lint]
  approved_test_tasks: [node.test]
  resource_limits:
    cpu: "1.0"
    memory_mb: 1024
    timeout_sec: 180
  require_approval_for_network: true
  require_approval_for_install: true
```

## Extending detectors

```ts
import { registerDetector } from "./adapters/build/detect/registry.js";
registerDetector({
  id: "my-stack",
  detect(ctx) { /* read manifests via ctx.readJson/readText */ return null; }
});
```

No gateway core change required.

## Security defaults

- No arbitrary shell tool
- No privileged containers
- No production secrets injected into jobs
- No unrestricted package-install scripts (`npm ci --ignore-scripts`, composer `--no-scripts`)
- No concurrent writers on same project
- Logs redacted + size-capped
- Workspace cleaned after job (delayed)

## Fixtures

See `fixtures/build/{node,python,php}-basic` for detection + smoke execution tests.
