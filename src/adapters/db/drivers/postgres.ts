import pg from "pg";
import type {
  DbDriver,
  DbQueryLimits,
  IndexInfo,
  QueryResult,
  ResolvedDbEndpoint,
  TableColumn,
} from "../types.js";

const { Client } = pg;

async function withClient<T>(
  ep: ResolvedDbEndpoint,
  timeoutMs: number,
  fn: (c: pg.Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    host: ep.host,
    port: ep.port || 5432,
    user: ep.user,
    password: ep.password,
    database: ep.database,
    ssl: ep.ssl ? { rejectUnauthorized: true } : undefined,
    connectionTimeoutMillis: Math.min(timeoutMs, 10_000),
    statement_timeout: timeoutMs,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function clampRows(
  rows: Record<string, unknown>[],
  maxRows: number
): { rows: Record<string, unknown>[]; truncated: boolean } {
  if (rows.length <= maxRows) return { rows, truncated: false };
  return { rows: rows.slice(0, maxRows), truncated: true };
}

export class PostgresDriver implements DbDriver {
  readonly engine = "postgresql" as const;

  async health(ep: ResolvedDbEndpoint, timeoutMs: number) {
    try {
      const r = await withClient(ep, timeoutMs, (c) => c.query("SELECT 1 AS ok"));
      return { ok: true, detail: `postgresql ok rows=${r.rowCount}` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listSchemas(
    ep: ResolvedDbEndpoint,
    allowedSchemas: string[],
    timeoutMs: number
  ) {
    return withClient(ep, timeoutMs, async (c) => {
      const r = await c.query<{ schema_name: string }>(
        `SELECT schema_name FROM information_schema.schemata
         WHERE schema_name = ANY($1::text[])
         ORDER BY schema_name`,
        [allowedSchemas]
      );
      return r.rows.map((x) => x.schema_name);
    });
  }

  async listTables(ep: ResolvedDbEndpoint, schema: string, timeoutMs: number) {
    return withClient(ep, timeoutMs, async (c) => {
      const r = await c.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [schema]
      );
      return r.rows.map((x) => x.table_name);
    });
  }

  async describeTable(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string,
    timeoutMs: number
  ): Promise<TableColumn[]> {
    return withClient(ep, timeoutMs, async (c) => {
      const r = await c.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table]
      );
      return r.rows.map((x) => ({
        name: x.column_name,
        dataType: x.data_type,
        nullable: x.is_nullable === "YES",
        defaultValue: x.column_default,
      }));
    });
  }

  async listIndexes(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string | undefined,
    timeoutMs: number
  ): Promise<IndexInfo[]> {
    return withClient(ep, timeoutMs, async (c) => {
      const r = await c.query<{
        indexname: string;
        tablename: string;
        indexdef: string;
      }>(
        table
          ? `SELECT indexname, tablename, indexdef FROM pg_indexes
             WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`
          : `SELECT indexname, tablename, indexdef FROM pg_indexes
             WHERE schemaname = $1 ORDER BY tablename, indexname`,
        table ? [schema, table] : [schema]
      );
      return r.rows.map((x) => ({
        name: x.indexname,
        table: x.tablename,
        columns: [],
        unique: /\bUNIQUE\b/i.test(x.indexdef),
      }));
    });
  }

  async performance(ep: ResolvedDbEndpoint, timeoutMs: number) {
    return withClient(ep, timeoutMs, async (c) => {
      const ver = await c.query("SELECT version() AS v");
      const act = await c.query(
        `SELECT count(*)::int AS active
         FROM pg_stat_activity WHERE state = 'active'`
      );
      const db = await c.query(
        `SELECT pg_database_size(current_database())::bigint AS bytes`
      );
      return {
        version: String(ver.rows[0]?.v || "").slice(0, 200),
        activeQueries: act.rows[0]?.active ?? null,
        databaseBytes: Number(db.rows[0]?.bytes || 0),
      };
    });
  }

  async queryRead(
    ep: ResolvedDbEndpoint,
    sql: string,
    params: unknown[],
    limits: Required<DbQueryLimits>
  ): Promise<QueryResult> {
    const started = Date.now();
    return withClient(ep, limits.statement_timeout_ms, async (c) => {
      await c.query("BEGIN READ ONLY");
      try {
        await c.query(
          `SET LOCAL statement_timeout = ${Math.max(1, limits.statement_timeout_ms)}`
        );
        const r = await c.query(sql, params);
        await c.query("COMMIT");
        const mapped = (r.rows as Record<string, unknown>[]) || [];
        const { rows, truncated } = clampRows(mapped, limits.max_rows);
        return {
          columns: r.fields?.map((f) => f.name) || [],
          rows,
          rowCount: mapped.length,
          truncated,
          durationMs: Date.now() - started,
        };
      } catch (err) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw err;
      }
    });
  }

  async applyMigrationSql(
    ep: ResolvedDbEndpoint,
    sql: string,
    timeoutMs: number
  ) {
    return withClient(ep, timeoutMs, async (c) => {
      await c.query("BEGIN");
      try {
        await c.query(sql);
        await c.query("COMMIT");
        return { ok: true, detail: "migration applied" };
      } catch (err) {
        await c.query("ROLLBACK").catch(() => undefined);
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    });
  }

  async backupStatus(ep: ResolvedDbEndpoint, timeoutMs: number) {
    return withClient(ep, timeoutMs, async (c) => {
      // Best-effort: archive mode / recent checkpoint — no secrets
      const r = await c.query(
        `SELECT pg_is_in_backup() AS in_backup,
                pg_is_in_recovery() AS in_recovery`
      );
      return {
        engine: "postgresql",
        inBackup: r.rows[0]?.in_backup ?? false,
        inRecovery: r.rows[0]?.in_recovery ?? false,
        checkedAt: new Date().toISOString(),
      };
    });
  }
}
