# ADR 007 — BuildOps isolated curated execution

## Decision
Add BuildOps with extensible stack detectors and curated argv task templates executed in isolated workspaces (Docker preferred; process runner opt-in for dev/test only). No free-form shell MCP tool.

## Why
Agents need validate/build/test across stacks without host privilege or AI-generated commands on production machines.

## Consequences
- Detectors register via `registerDetector()` — gateway untouched
- Tasks are fixed argv + image; project `approved_tasks` filters
- Job workspaces under `build.work_root`, per principal+job; concurrent lock per project
- Network default `none`; install/network need `build.approval.create`
- Production must use `runner: docker` (process forbidden when `environment: production`)
