import type {
  DbDriver,
  DbQueryLimits,
  IndexInfo,
  QueryResult,
  ResolvedDbEndpoint,
  TableColumn,
} from "../types.js";

export type MockDbState = {
  schemas: string[];
  tables: Record<string, string[]>;
  columns: Record<string, TableColumn[]>;
  indexes: IndexInfo[];
  rows: Record<string, unknown>[];
  failConnect?: boolean;
  applied: string[];
  readOnlyThrowsOnWrite?: boolean;
};

export function createDefaultMockState(): MockDbState {
  return {
    schemas: ["public", "app"],
    tables: {
      public: ["users", "orders"],
      app: ["settings"],
    },
    columns: {
      "public.users": [
        { name: "id", dataType: "integer", nullable: false },
        { name: "email", dataType: "text", nullable: false },
        { name: "password", dataType: "text", nullable: false },
      ],
    },
    indexes: [
      {
        name: "users_pkey",
        table: "users",
        columns: ["id"],
        unique: true,
      },
    ],
    rows: [
      { id: 1, email: "a@example.com", password: "secret" },
      { id: 2, email: "b@example.com", password: "secret2" },
    ],
    applied: [],
    readOnlyThrowsOnWrite: true,
  };
}

export class MockDbDriver implements DbDriver {
  readonly engine = "postgresql" as const;
  constructor(private readonly state: MockDbState) {}

  private guard(ep: ResolvedDbEndpoint) {
    if (this.state.failConnect) {
      throw new Error(`connection failed to ${ep.host}`);
    }
  }

  async health(ep: ResolvedDbEndpoint, _timeoutMs: number) {
    try {
      this.guard(ep);
      return { ok: true, detail: "mock ok" };
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
    _timeoutMs: number
  ) {
    this.guard(ep);
    return this.state.schemas.filter((s) => allowedSchemas.includes(s));
  }

  async listTables(ep: ResolvedDbEndpoint, schema: string, _timeoutMs: number) {
    this.guard(ep);
    return this.state.tables[schema] || [];
  }

  async describeTable(
    ep: ResolvedDbEndpoint,
    schema: string,
    table: string,
    _timeoutMs: number
  ) {
    this.guard(ep);
    return this.state.columns[`${schema}.${table}`] || [];
  }

  async listIndexes(
    ep: ResolvedDbEndpoint,
    _schema: string,
    table: string | undefined,
    _timeoutMs: number
  ) {
    this.guard(ep);
    return table
      ? this.state.indexes.filter((i) => i.table === table)
      : this.state.indexes;
  }

  async performance(ep: ResolvedDbEndpoint, _timeoutMs: number) {
    this.guard(ep);
    return { engine: "mock", activeQueries: 0, databaseBytes: 1024 };
  }

  async queryRead(
    ep: ResolvedDbEndpoint,
    sql: string,
    _params: unknown[],
    limits: Required<DbQueryLimits>
  ): Promise<QueryResult> {
    this.guard(ep);
    if (
      this.state.readOnlyThrowsOnWrite &&
      /\b(INSERT|UPDATE|DELETE|DROP)\b/i.test(sql)
    ) {
      throw new Error("cannot execute WRITE in a read-only transaction");
    }
    const rows = this.state.rows.slice(0, limits.max_rows);
    return {
      columns: rows[0] ? Object.keys(rows[0]) : [],
      rows,
      rowCount: this.state.rows.length,
      truncated: this.state.rows.length > limits.max_rows,
      durationMs: 1,
    };
  }

  async applyMigrationSql(
    ep: ResolvedDbEndpoint,
    sql: string,
    _timeoutMs: number
  ) {
    this.guard(ep);
    this.state.applied.push(sql);
    // simulate schema change
    if (!this.state.tables.public) this.state.tables.public = [];
    if (!this.state.tables.public.includes("migrated")) {
      this.state.tables.public.push("migrated");
    }
    return { ok: true, detail: "mock migration applied" };
  }

  async backupStatus(ep: ResolvedDbEndpoint, _timeoutMs: number) {
    this.guard(ep);
    return {
      engine: "mock",
      lastBackupAt: new Date().toISOString(),
      ok: true,
      checkedAt: new Date().toISOString(),
    };
  }
}
