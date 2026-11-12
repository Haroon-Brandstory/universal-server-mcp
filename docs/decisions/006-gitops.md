# ADR 006 — GitOps via GitHub API (no shell git)

## Decision
Add policy-gated GitOps tools backed by GitHub REST API (prefer GitHub App installation tokens). No local `git` CLI, no force push, no PR merge, no commits to protected/default branches. Write tools require short-lived `approvalId` from `git.approval.create`.

## Why
Agents already edit files via CodeOps. Safe remote collaboration needs branch/PR workflow without granting shell or bypassing branch protection.

## Consequences
- Repos declared per project (`projects[].github_repos`)
- Principal isolation via merged `allow_repos`
- Credentials only via env (`GITHUB_APP_*` or local `GITHUB_TOKEN`)
- Tokens never appear in MCP tool responses / audit targets
