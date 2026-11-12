# ADR 009 — DatabaseOps driver registry + read-only first

## Decision
Add DatabaseOps with a driver interface, PostgreSQL/MySQL(/MariaDB) adapters, YAML connection registry (env credential refs), read tools bound to read identities + READ ONLY transactions, and curated migration apply behind approvals/backup verification. Restore remains plan-only. Mongo/SQLite/Redis deferred until implemented and tested.

## Why
Agents need schema/diagnostics without free-form production SQL or secret leakage.

## Consequences
- Access gated by project + connection permissions + capability class
- SQL string checks are defense-in-depth only
- Production migrations require explicit `allow_production_migrations` (default false) — prefer DeployOps
- Drivers register by engine; gateway stays thin
