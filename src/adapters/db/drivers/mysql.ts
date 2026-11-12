import mysql from "mysql2/promise";
import type {
  DbDriver,
  DbQueryLimits,
  IndexInfo,
  QueryResult,
  ResolvedDbEndpoint,
  TableColumn,
} from "../types.js";

async function withConn<T>(
  ep: ResolvedDbEndpoint,
  timeoutMs: number,
  fn: (c: mysql.Connection) => Promise<T>
): Promise<T> {
  const conn = await mysql.createConnection({
    host: ep.host,
    port: ep.port || 3306,
    user: ep.user,
    password: ep.password,
    database: ep.database,
    ssl: ep.ssl ? {} : undefined,
    connectTimeout: Math.min(timeoutMs, 10_000),
    // mysql2: multipleStatements off by default — keep that
  });
  try {
    await conn.query(`SET SESSION MAX_EXECUTION_TIME=${Math.max(1, timeoutMs)}`);
    return await fn(conn);
  } finally {
    await conn.end().catch(() => undefined);
  }
}

function clampRows(
  rows: Record<string, unknown>[],
  maxRows: number
): { rows: Record<string, unknown>[]; truncated: boolean } {
  if (rows.length <= maxRows) return { rows, truncated: false };
  return { rows: rows.slice(0, maxRows), truncated: true };
}

export class MysqlDriver implements DbDriver {
  readonly engine: "mysql" | "mariadb";
  constructor(engine: "mysql" | "mariadb" = "mysql") {
    this.engine = engine;
  }

  async health(ep: ResolvedDbEndpoint, timeoutMs: number) {
    try {
      await withConn(ep, timeoutMs, async (c) => {
        await c.query("SELECT 1 AS ok");
      });
      return { ok: true, detail: "mysql ok" };
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
    return withConn(ep, timeoutMs, async (c) => {
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        `SELECT SCHEMA_NAME AS schema_name FROM information_schema.SCHEMATA
         WHERE SCHEMA_NAME IN (?)`,
        [allowedSchemas]
      );
      return (rows as Array<{ schema_name: string }>).map((x) => x.schema_name);
    });
  }

  async listTables(ep: ResolvedDbEndpoint, schema: string, timeoutMs: number) {
    return withConn(ep, timeoutMs, async (c) => {
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [schema]
      );
      return (rows as Array<{ table_name: string }>).map((x) => x.table_name);
    });
  }

  async describeTable(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string,
    timeoutMs: number
  ): Promise<TableColumn[]> {
    return withConn(ep, timeoutMs, async (c) => {
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [schema, table]
      );
      return (
        rows as Array<{
          COLUMN_NAME: string;
          DATA_TYPE: string;
          IS_NULLABLE: string;
          COLUMN_DEFAULT: string | null;
        }>
      ).map((x) => ({
        name: x.COLUMN_NAME,
        dataType: x.DATA_TYPE,
        nullable: x.IS_NULLABLE === "YES",
        defaultValue: x.COLUMN_DEFAULT,
      }));
    });
  }

  async listIndexes(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string | undefined,
    timeoutMs: number
  ): Promise<IndexInfo[]> {
    return withConn(ep, timeoutMs, async (c) => {
      const sql = table
        ? `SELECT INDEX_NAME, TABLE_NAME, COLUMN_NAME, NON_UNIQUE
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY INDEX_NAME, SEQ_IN_INDEX`
        : `SELECT INDEX_NAME, TABLE_NAME, COLUMN_NAME, NON_UNIQUE
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        sql,
        table ? [schema, table] : [schema]
      );
      const map = new Map<string, IndexInfo>();
      for (const x of rows as Array<{
        INDEX_NAME: string;
        TABLE_NAME: string;
        COLUMN_NAME: string;
        NON_UNIQUE: number;
      }>) {
        const key = `${x.TABLE_NAME}.${x.INDEX_NAME}`;
        const cur = map.get(key) || {
          name: x.INDEX_NAME,
          table: x.TABLE_NAME,
          columns: [] as string[],
          unique: x.NON_UNIQUE === 0,
        };
        cur.columns.push(x.COLUMN_NAME);
        map.set(key, cur);
      }
      return [...map.values()];
    });
  }

  async performance(ep: ResolvedDbEndpoint, timeoutMs: number) {
    return withConn(ep, timeoutMs, async (c) => {
      const [ver] = await c.query<mysql.RowDataPacket[]>("SELECT VERSION() AS v");
      const [threads] = await c.query<mysql.RowDataPacket[]>(
        "SHOW GLOBAL STATUS LIKE 'Threads_running'"
      );
      return {
        version: String((ver as Array<{ v: string }>)[0]?.v || "").slice(0, 120),
        threadsRunning: (threads as Array<{ Value: string }>)[0]?.Value ?? null,
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
    return withConn(ep, limits.statement_timeout_ms, async (c) => {
      // MySQL: start read-only transaction (8.0+). Fall back if unsupported.
      try {
        await c.query("START TRANSACTION READ ONLY");
      } catch {
        await c.query("START TRANSACTION");
      }
      try {
        const [rows, fields] = await c.query<mysql.RowDataPacket[]>(sql, params);
        await c.query("COMMIT");
        const mapped = (rows as Record<string, unknown>[]) || [];
        const { rows: clipped, truncated } = clampRows(mapped, limits.max_rows);
        const columns = Array.isArray(fields)
          ? (fields as mysql.FieldPacket[]).map((f) => String(f.name))
          : [];
        return {
          columns,
          rows: clipped,
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
    return withConn(ep, timeoutMs, async (c) => {
      await c.query("START TRANSACTION");
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
    return withConn(ep, timeoutMs, async (c) => {
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        "SHOW GLOBAL VARIABLES LIKE 'version'"
      );
      return {
        engine: "mysql",
        version: (rows as Array<{ Value: string }>)[0]?.Value ?? null,
        note: "Operator backup tooling external; no dump secrets returned",
        checkedAt: new Date().toISOString(),
      };
    });
  }
}

/** MariaDB uses MySQL wire protocol — same driver, tagged engine. */
export function createMariaDbDriver(): MysqlDriver {
  return new MysqlDriver("mariadb");
}
