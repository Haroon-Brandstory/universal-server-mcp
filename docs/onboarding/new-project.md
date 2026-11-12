# New project onboarding

Add a project **without editing gateway core**.

1. **`config/projects.yaml`** — id, name, paths, repos, stack_profile, associations
2. **`config/policy.yaml`** — ensure principal `projects: [your-id]`
3. Optional registries:
   - `config/servers.yaml` → `server_ids`
   - `config/databases.yaml` → `database_ids`
   - `config/security.yaml` → `security_target_ids`
   - `config/deployments.yaml` → `deploy_project_id`
4. Restart MCP process (policy reload on each call, but env/keys may need restart)
5. Verify: `platform.projects` lists the project for that principal

Do not put secrets in YAML — env refs only.
