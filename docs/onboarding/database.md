# Database onboarding (DatabaseOps)

1. Create **separate** read vs write DB roles
2. Put host/user/password/database in env vars — reference names in `config/databases.yaml`
3. Set `allowed_databases` / `allowed_schemas` exact allowlists
4. Set `redact_columns` for secrets
5. Point `migrations_path` at curated `.sql` only
6. Keep `allow_production_migrations: false` unless DeployOps owns the change
7. Link `database_ids` on the project in `config/projects.yaml`
8. Optional live smoke: `TEST_DATABASE_URL` / `TEST_MYSQL_URL`
