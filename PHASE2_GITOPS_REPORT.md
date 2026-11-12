# Phase 2 Implementation Report — GitOps

**Date:** 2026-11-12  
**Scope:** Secure GitHub GitOps tools on existing `global-server-mcp` gateway  
**Constraint:** No production repo writes performed by this work; no Phase 3.

## Summary

GitOps added as a thin adapter behind the existing AuthZ spine. Tools talk to **GitHub REST API** (prefer **GitHub App** installation auth). No `git` shell, no force-push, no PR merge, no commits to default/protected branches. Writes need short-lived **`approvalId`**.

## Architecture

```
AI client → MCP gateway (cap + write/admin + audit)
         → assertRepoAllowed(principal.allow_repos)
         → git approval consume (writes)
         → adapters/git/operations.ts → Octokit
```

Repos come from `policy.projects[].github_repos`, merged into principal `allow_repos` (same pattern as hosts/paths). Project A principal cannot access Project B repos.

## Tools

| Tool | Class | Behavior |
|---|---|---|
| `git.repo.list` | read | Allowed repos |
| `git.repo.info` | read | Meta, protection summary, commits |
| `git.branch.list` | read | Branches |
| `git.file.read` | read | File/dir via Contents API |
| `git.diff` | read | Compare commits; divergence flag |
| `git.pr.status` | read | Reviews + merge conflict signals |
| `git.ci.status` | read | Checks + combined status |
| `git.branch.create` | write | Feature branch only + approval |
| `git.commit` | write | Feature branch, FF-only ref update + approval |
| `git.pr.create` | write | Open PR only + approval |
| `git.approval.create` | admin | Issues approvalId |

## Security controls delivered

- Project-scoped repo allowlist
- Capability + write/admin class checks (reuse Phase 1)
- Explicit write approval tickets (principal + repo + action + TTL/uses)
- Deny commit to `main`/`master`/`production`/config list
- Feature branch name pattern
- Refuse commit when GitHub branch protection enabled
- `force: false` only on ref update
- No merge API
- Credentials from env only; errors sanitized; tokens not in responses
- Audit via existing gateway allow/deny path

## Files

**New:** `src/adapters/git/*`, `docs/GITOPS.md`, `docs/decisions/006-gitops.md`, this report  
**Updated:** `types.ts`, `capabilities.ts`, `resolvePrincipal.ts`, `definitions.ts`, `gateway.ts`, `policy.yaml` + examples, `.env.example`, `README`, `AGENTS`, `progress`, tests, `package.json` (Octokit)

## Tests

Mocked Octokit coverage: isolation, approval required, main commit deny, concurrent FF failure, 401/rate-limit mapping, malformed path, PR conflict flag, diff divergence.

## Setup

See `docs/GITOPS.md`. Set `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`. Align `github_repos` with real installs.

## Remaining limits

- Approvals are in-process memory (lost on restart)
- No CODEOWNERS / ruleset deep modeling beyond branch protection GET
- No multi-file binary commit path beyond utf-8 blobs
- GitHub App must be installed only on intended repos (operator duty)
- Phase 3 BuildOps not started

## Ready for Phase 3?

**Yes** — GitOps foundation complete. Next: sandboxed BuildOps, still no unrestricted shell.
