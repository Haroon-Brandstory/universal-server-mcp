import type { PolicyEnvironment } from "../../types.js";

export type DbEngine =
  | "postgresql"
  | "mysql"
  | "mariadb"
  | "mongodb"
  | "sqlite"
  | "redis";

export type DbIdentityMode = "read" | "write";

/** Credential refs — env var names only; never literal secrets in YAML. */
export interface DbCredentialRefs {
  host_env?: string;
  port_env?: string;
  user_env: string;
  password_env: string;
  database_env?: string;
  /** Optional full URL env (still never returned to clients). */
  url_env?: string;
  ssl_env?: string;
}

export interface DbQueryLimits {
  max_rows?: number;
  max_result_bytes?: number;
  statement_timeout_ms?: number;
  /** Max SQL length for db.query.read. */
  max_sql_chars?: number;
}

export interface DbConnectionRecord {
  id: string;
  project_id: string;
  environment: PolicyEnvironment;
  engine: DbEngine;
  label?: string;
  enabled?: boolean;
  /** Separate read vs write credential refs. */
  credentials: {
    read: DbCredentialRefs;
    write?: DbCredentialRefs;
  };
  /** Allowlisted database/schema names (exact). */
  allowed_databases: string[];
  allowed_schemas: string[];
  /** Column names always redacted in row payloads. */
  redact_columns?: string[];
  permissions: {
    read: boolean;
    write: boolean;
    migrate: boolean;
    backup: boolean;
    restore: boolean;
  };
  query_limits?: DbQueryLimits;
  /** Curated migration directory (absolute or cwd-relative). */
  migrations_path?: string;
  /** Optional backup status probe metadata. */
  backup?: {
    /** Table or logical source label for status (engine-specific). */
    status_source?: string;
  };
}

export interface DatabasesDocument {
  version: number;
  connections: DbConnectionRecord[];
}

export interface ResolvedDbEndpoint {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  /** Internal only — never expose. */
  url?: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export interface TableColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string | null;
}

export interface IndexInfo {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

export interface MigrationFile {
  id: string;
  filename: string;
  checksum: string;
  bytes: number;
}

export interface DbDriver {
  readonly engine: DbEngine;
  health(ep: ResolvedDbEndpoint, timeoutMs: number): Promise<{ ok: boolean; detail: string }>;
  listSchemas(
    ep: ResolvedDbEndpoint,
    allowedSchemas: string[],
    timeoutMs: number
  ): Promise<string[]>;
  listTables(
    ep: ResolvedDbEndpoint,
    schema: string,
    timeoutMs: number
  ): Promise<string[]>;
  describeTable(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string,
    timeoutMs: number
  ): Promise<TableColumn[]>;
  listIndexes(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string | undefined,
    timeoutMs: number
  ): Promise<IndexInfo[]>;
  performance(
    ep: ResolvedDbEndpoint,
    timeoutMs: number
  ): Promise<Record<string, unknown>>;
  /**
   * Read-only query execution. Drivers must enforce READ ONLY transaction
   * / session where the engine supports it.
   */
  queryRead(
    ep: ResolvedDbEndpoint,
    sql: string,
    params: unknown[],
    limits: Required<DbQueryLimits>
  ): Promise<QueryResult>;
  /**
   * Apply a single curated migration SQL file under write identity.
   * Never accepts arbitrary AI SQL from tool args beyond file contents.
   */
  applyMigrationSql(
    ep: ResolvedDbEndpoint,
    sql: string,
    timeoutMs: number
  ): Promise<{ ok: boolean; detail: string }>;
  backupStatus(
    ep: ResolvedDbEndpoint,
    timeoutMs: number
  ): Promise<Record<string, unknown>>;
}
