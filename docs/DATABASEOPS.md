# DatabaseOps

Secure multi-engine database inspection + curated migrations for MCP agents.

## Implemented engines

| Engine | Status |
|---|---|
| PostgreSQL | Implemented (`pg`) |
| MySQL | Implemented (`mysql2`) |
| MariaDB | Implemented (MySQL wire) |
| MongoDB / SQLite / Redis | Interface reserved — not shipped until tested |

## Tools

| Tool | Class | Notes |
|---|---|---|
| `db.connections` | read | Env credential refs only — no secrets |
| `db.health` / `schemas` / `tables` / `table.describe` | read | Allowlisted schemas |
| `db.query.read` | read | SELECT/WITH + read identity + READ ONLY txn |
| `db.performance` / `indexes` | read | Coarse stats |
| `db.migration.plan` / `validate` | read | Curated `.sql` files only |
| `db.migration.apply` | write | Approval + confirms + backup verify |
| `db.backup.status` | read | Issues `backupVerifiedId` |
| `db.restore.plan` | read | Plan only — no MCP restore execution |
| `db.approval.create` | admin | Migration/backup/restore tickets |

## Registry (`config/databases.yaml`)

Each connection: `id`, `project_id`, `environment`, `engine`, credential **env refs**, `allowed_databases` / `allowed_schemas`, `permissions`, `query_limits`, optional `migrations_path`.

Access = principal `projects` ∩ `project_id`.

## Safeguards

1. Separate read vs write credential refs
2. Schema/database allowlists (not SQL parsing alone)
3. `BEGIN READ ONLY` / MySQL `START TRANSACTION READ ONLY` on reads
4. SQL guard: SELECT/WITH only, no multi-statement
5. Statement timeout, max rows, max result bytes
6. Column redaction (`password`, tokens, plus `redact_columns`)
7. Migrations: curated files under `migrations_path` only
8. Production apply blocked unless `allow_production_migrations: true`
9. Backup verification required before destructive apply (default)
10. Rate limit + per-connection lock

## Policy

```yaml
databaseops:
  enabled: true
  databases_path: ./config/databases.yaml
  require_migration_approval: true
  require_backup_before_destructive: true
  allow_production_migrations: false
  default_statement_timeout_ms: 5000
  default_max_rows: 100
  default_max_result_bytes: 64000
  migration_rate_limit_per_min: 3
```

## Live test hooks

```bash
TEST_DATABASE_URL=postgres://... npm test   # optional PG smoke
TEST_MYSQL_URL=mysql://... npm test         # optional MySQL smoke
```

Default CI uses mock drivers — no production DB touch.
