# Phase 3 Implementation Report — BuildOps

**Date:** 2026-11-12  
**Constraint:** Not deployed to production. Existing WebOps/CodeOps/GitOps retained.

## Summary

BuildOps adds stack detection + isolated curated task execution. Agents never get a free-form shell. Docker is the default sandbox; process runner is opt-in for local/dev tests only.

## Delivered

| Item | Location |
|---|---|
| Stack detectors (extensible) | `src/adapters/build/detect/` |
| Curated tasks | `src/adapters/build/tasks.ts` |
| Job manager + locks + workspaces | `src/adapters/build/jobs.ts` |
| Docker + process runners | `src/adapters/build/runner/` |
| Approvals | `src/adapters/build/approval.ts` |
| MCP tools | `definitions.ts` + `gateway.ts` |
| Policy | `config/policy.yaml` `build:` + per-project `build:` |
| Fixtures | `fixtures/build/*` |
| Docs | `docs/BUILDOPS.md`, ADR 007 |
| Tests | detect + jobs tests (mocked unsupported runtimes) |

## Tool surface

`build.detect_stack`, `build.list_tasks`, `build.run`, `build.test`, `build.lint`, `build.typecheck`, `build.status`, `build.logs`, `build.cancel`, plus admin `build.approval.create`.

## Detection coverage

Next/React/Vue/Angular/Nuxt/Svelte, Node/Express/Nest/Strapi, PHP/Laravel/WordPress, Python/Django/FastAPI, Java Maven/Gradle/Spring, .NET, Go, static HTML — via manifests + dependency metadata (not filenames alone).

## Security posture

Matches Phase 3 requirements: curated argv, non-privileged containers, job/principal workspaces, resource/time limits, network default none, no docker.sock/credentials, log redaction, cleanup, no AI commands on production host.

## Limits / follow-ups

- Docker allowlist networking is coarse (bridge vs none); fine-grained egress proxy not included
- Language images must be pulled by operator before first docker job
- Process runner cannot enforce network isolation
- Install scripts disabled by template; some projects may need explicit approved install tasks + approval

## Ready for Phase 4 ServerOps?

**Yes**, after operator validates Docker images locally. Do not enable process runner in production.
