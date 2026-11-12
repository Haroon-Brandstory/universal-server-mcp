# GitOps — GitHub App setup

## Prefer GitHub App (repository-scoped)

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Permissions (minimum):
   - Repository **Contents**: Read & write (for branch/commit)
   - Repository **Pull requests**: Read & write
   - Repository **Checks**: Read
   - Repository **Commit statuses**: Read
   - Repository **Metadata**: Read
3. **Disable** permission to administer or delete repos. Do **not** grant org admin.
4. Install the app on **only** the repositories listed in `config/policy.yaml` → `projects[].github_repos`.
5. Copy:
   - App ID → `GITHUB_APP_ID`
   - Installation ID (from install URL) → `GITHUB_APP_INSTALLATION_ID`
   - Generate private key → save PEM → `GITHUB_APP_PRIVATE_KEY_PATH`

## Env

```bash
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=987654
GITHUB_APP_PRIVATE_KEY_PATH=/secure/path/github-app.pem
```

Local fallback (dev only): `GITHUB_TOKEN` fine-grained PAT with the same least privileges. Prefer App for production.

## Policy

```yaml
projects:
  - id: my-app
    github_repos:
      - myorg/my-app

github:
  deny_commit_branches: [main, master, production]
  feature_branch_pattern: "^(feat|fix|chore|docs|refactor|gitops)/[A-Za-z0-9._/-]+$"
  require_write_approval: true
```

Principals only see repos from **their** `projects`. Project A cannot touch Project B repos.

## Write flow (required)

1. Admin principal: `git.approval.create` `{ "repo": "owner/name" }` → `approvalId`
2. `git.branch.create` with `approvalId`
3. `git.commit` on feature branch with `approvalId` + `files[]`
4. `git.pr.create` with `approvalId`
5. `git.pr.status` / `git.ci.status` to observe — **no merge tool exists**

## Hard denials

- Direct commit to `main` / `master` / `production` / policy deny list
- Commit to GitHub-protected branches
- Force push
- Automatic PR merge
- Arbitrary git shell
- Cross-project repo access

## Tools

| Tool | Class | Notes |
|---|---|---|
| `git.repo.list` | read | Allowed repos only |
| `git.repo.info` | read | Protection summary + recent commits |
| `git.branch.list` | read | |
| `git.file.read` | read | |
| `git.diff` | read | |
| `git.pr.status` | read | Conflicts / reviews |
| `git.ci.status` | read | Checks + statuses |
| `git.branch.create` | write | Needs approval |
| `git.commit` | write | Needs approval |
| `git.pr.create` | write | Needs approval; no merge |
| `git.approval.create` | admin | Issues approvalId |
