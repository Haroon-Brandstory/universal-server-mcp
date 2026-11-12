import { randomUUID } from "node:crypto";
import type { PolicyDocument, Principal } from "../../types.js";
import {
  createDbApproval,
  consumeDbApproval,
  type DbApprovalAction,
} from "./approval.js";
import {
  acquireDbLock,
  assertBackupVerified,
  checkDbRate,
  markBackupVerified,
  releaseDbLock,
} from "./controls.js";
import { resolveEndpoint } from "./credentials.js";
import { getDbDriver } from "./drivers/index.js";
import {
  loadMigrationFiles,
  readMigrationSql,
  validateMigrationSql,
} from "./migrations.js";
import {
  getAccessibleConnection,
  listAccessibleConnections,
  publicConnectionView,
} from "./registry.js";
import { redactRows } from "./sanitize.js";
import { assertReadOnlySql, assertSafeIdent } from "./sqlGuard.js";
import type {
  DbConnectionRecord,
  DbIdentityMode,
  DbQueryLimits,
  ResolvedDbEndpoint,
} from "./types.js";

function requireDbOps(policy: PolicyDocument): void {
  if (policy.databaseops?.enabled === false) {
    throw new Error("DatabaseOps disabled in policy");
  }
}

function limitsFor(
  policy: PolicyDocument,
  conn: DbConnectionRecord
): Required<DbQueryLimits> {
  return {
    max_rows: Math.min(
      conn.query_limits?.max_rows ||
        policy.databaseops?.default_max_rows ||
        100,
      1000
    ),
    max_result_bytes: Math.min(
      conn.query_limits?.max_result_bytes ||
        policy.databaseops?.default_max_result_bytes ||
        64_000,
      256_000
    ),
    statement_timeout_ms: Math.min(
      conn.query_limits?.statement_timeout_ms ||
        policy.databaseops?.default_statement_timeout_ms ||
        5000,
      60_000
    ),
    max_sql_chars: Math.min(
      conn.query_limits?.max_sql_chars || 4000,
      8000
    ),
  };
}

function endpointFor(
  conn: DbConnectionRecord,
  mode: DbIdentityMode
): ResolvedDbEndpoint {
  if (mode === "write") {
    if (!conn.credentials.write) {
      throw new Error(`Connection ${conn.id} has no write credentials`);
    }
    return resolveEndpoint(conn.credentials.write);
  }
  return resolveEndpoint(conn.credentials.read);
}

function assertSchemaAllowed(conn: DbConnectionRecord, schema: string): string {
  const s = assertSafeIdent(schema, "schema");
  if (!conn.allowed_schemas.includes(s)) {
    throw new Error(`Schema not allowlisted on connection: ${s}`);
  }
  return s;
}

function assertDbAllowed(conn: DbConnectionRecord, database?: string): void {
  if (!database) return;
  if (!conn.allowed_databases.includes(database)) {
    throw new Error(`Database not allowlisted: ${database}`);
  }
}

export function listConnections(policy: PolicyDocument, principal: Principal) {
  requireDbOps(policy);
  return {
    connections: listAccessibleConnections(policy, principal).map(
      publicConnectionView
    ),
    implementedEngines: ["postgresql", "mysql", "mariadb"],
  };
}

export async function health(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const ep = endpointFor(conn, "read");
  assertDbAllowed(conn, ep.database);
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const h = await driver.health(ep, lim.statement_timeout_ms);
  return {
    connectionId: conn.id,
    engine: conn.engine,
    environment: conn.environment,
    database: ep.database,
    host: ep.host,
    ok: h.ok,
    detail: h.detail,
  };
}

export async function schemas(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const list = await driver.listSchemas(
    ep,
    conn.allowed_schemas,
    lim.statement_timeout_ms
  );
  return { connectionId: conn.id, schemas: list };
}

export async function tables(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const schema = assertSchemaAllowed(conn, String(args.schema || ""));
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const list = await driver.listTables(ep, schema, lim.statement_timeout_ms);
  return { connectionId: conn.id, schema, tables: list };
}

export async function tableDescribe(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const schema = assertSchemaAllowed(conn, String(args.schema || ""));
  const table = assertSafeIdent(String(args.table || ""), "table");
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const columns = await driver.describeTable(
    ep,
    schema,
    table,
    lim.statement_timeout_ms
  );
  return { connectionId: conn.id, schema, table, columns };
}

export async function queryRead(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const lim = limitsFor(policy, conn);
  const sql = assertReadOnlySql(String(args.sql || ""), lim.max_sql_chars);
  const params = Array.isArray(args.params) ? args.params : [];
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const raw = await driver.queryRead(ep, sql, params, lim);
  const maxBytes = Math.min(
    lim.max_result_bytes,
    principal.max_response_bytes
  );
  const { rows, truncatedBytes } = redactRows(
    raw.rows,
    conn.redact_columns,
    maxBytes
  );
  return {
    connectionId: conn.id,
    columns: raw.columns,
    rows,
    rowCount: raw.rowCount,
    truncated: raw.truncated || truncatedBytes,
    durationMs: raw.durationMs,
  };
}

export async function performance(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const stats = await driver.performance(ep, lim.statement_timeout_ms);
  return { connectionId: conn.id, engine: conn.engine, stats };
}

export async function indexes(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.read) throw new Error("Connection read=false");
  const schema = assertSchemaAllowed(conn, String(args.schema || ""));
  const table = args.table
    ? assertSafeIdent(String(args.table), "table")
    : undefined;
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const list = await driver.listIndexes(
    ep,
    schema,
    table,
    lim.statement_timeout_ms
  );
  return { connectionId: conn.id, schema, table: table || null, indexes: list };
}

export function migrationPlan(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.migrate) {
    throw new Error("Connection migrate=false");
  }
  if (!conn.migrations_path) {
    throw new Error("No migrations_path configured for connection");
  }
  const files = loadMigrationFiles(conn.migrations_path);
  return {
    connectionId: conn.id,
    environment: conn.environment,
    migrationsPath: conn.migrations_path,
    migrations: files,
    note: "Plan only — apply requires approval and non-prod unless explicitly enabled",
  };
}

export function migrationValidate(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.migrate) {
    throw new Error("Connection migrate=false");
  }
  if (!conn.migrations_path) {
    throw new Error("No migrations_path configured for connection");
  }
  const migrationId = String(args.migrationId || "");
  const file = readMigrationSql(conn.migrations_path, migrationId);
  const v = validateMigrationSql(file.sql);
  return {
    connectionId: conn.id,
    migrationId: file.filename,
    checksum: file.checksum,
    ok: v.ok,
    warnings: v.warnings,
    bytes: Buffer.byteLength(file.sql, "utf8"),
  };
}

export async function migrationApply(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  if (!principal.write) throw new Error("Principal write=false");
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.migrate || !conn.permissions.write) {
    throw new Error("Connection lacks migrate/write permission");
  }
  if (!conn.migrations_path) {
    throw new Error("No migrations_path configured for connection");
  }

  if (
    policy.environment === "production" ||
    conn.environment === "production"
  ) {
    if (!policy.databaseops?.allow_production_migrations) {
      throw new Error(
        "Production migrations blocked — use approved DeployOps workflow (allow_production_migrations=false)"
      );
    }
  }

  const requireApproval =
    policy.databaseops?.require_migration_approval !== false;
  const requireBackup =
    policy.databaseops?.require_backup_before_destructive !== false;

  let backupVerifiedId: string | undefined;
  if (requireApproval) {
    const approvalId = String(args.approvalId || "");
    if (!approvalId) {
      throw new Error("approvalId required — create via db.approval.create");
    }
    const a = consumeDbApproval({
      approvalId,
      principalId: principal.id,
      connectionId: conn.id,
      environment: conn.environment,
      action: "migration.apply",
      confirmConnectionId: String(args.confirmConnectionId || ""),
      confirmEnvironment: String(args.confirmEnvironment || ""),
      requireBackupVerified: requireBackup,
    });
    backupVerifiedId = a.backupVerifiedId;
  } else if (
    String(args.confirmConnectionId || "") !== conn.id ||
    String(args.confirmEnvironment || "") !== conn.environment
  ) {
    throw new Error("confirmConnectionId/confirmEnvironment required");
  }

  if (requireBackup) {
    const id = backupVerifiedId || String(args.backupVerifiedId || "");
    assertBackupVerified(conn.id, id);
  }

  const migrationId = String(args.migrationId || "");
  const file = readMigrationSql(conn.migrations_path, migrationId);
  const v = validateMigrationSql(file.sql);
  if (!v.ok) {
    throw new Error(`Migration validation failed: ${v.warnings.join(", ")}`);
  }

  checkDbRate(
    conn.id,
    policy.databaseops?.migration_rate_limit_per_min || 3
  );
  const opId = randomUUID();
  acquireDbLock(conn.id, opId);
  try {
    const ep = endpointFor(conn, "write");
    const driver = getDbDriver(conn.engine);
    const lim = limitsFor(policy, conn);
    const before = await driver.listTables(
      endpointFor(conn, "read"),
      conn.allowed_schemas[0] || "public",
      lim.statement_timeout_ms
    ).catch(() => [] as string[]);
    const result = await driver.applyMigrationSql(
      ep,
      file.sql,
      lim.statement_timeout_ms
    );
    const after = await driver.listTables(
      endpointFor(conn, "read"),
      conn.allowed_schemas[0] || "public",
      lim.statement_timeout_ms
    ).catch(() => [] as string[]);
    return {
      connectionId: conn.id,
      environment: conn.environment,
      migrationId: file.filename,
      checksum: file.checksum,
      warnings: v.warnings,
      ok: result.ok,
      detail: result.detail,
      beforeTableCount: before.length,
      afterTableCount: after.length,
    };
  } finally {
    releaseDbLock(conn.id, opId);
  }
}

export async function backupStatus(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.backup && !conn.permissions.read) {
    throw new Error("Connection lacks backup/read permission");
  }
  const ep = endpointFor(conn, "read");
  const driver = getDbDriver(conn.engine);
  const lim = limitsFor(policy, conn);
  const status = await driver.backupStatus(ep, lim.statement_timeout_ms);
  const backupVerifiedId = randomUUID();
  markBackupVerified(conn.id, backupVerifiedId);
  return {
    connectionId: conn.id,
    status,
    backupVerifiedId,
    note: "Pass backupVerifiedId into db.approval.create before migration.apply",
  };
}

export function restorePlan(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (!conn.permissions.restore) {
    throw new Error("Connection restore=false");
  }
  return {
    connectionId: conn.id,
    environment: conn.environment,
    engine: conn.engine,
    plan: [
      "1. Verify backup artifact out-of-band (checksum)",
      "2. Obtain db.approval.create with action restore + backupVerifiedId",
      "3. Execute restore via operator DeployOps — MCP does not run unrestricted restore SQL",
    ],
    executableViaMcp: false,
    reason:
      "Restore is high-risk; plan only. Direct restore execution deferred to DeployOps.",
  };
}

export function approvalCreate(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>
) {
  requireDbOps(policy);
  const conn = getAccessibleConnection(
    policy,
    principal,
    String(args.connectionId || "")
  );
  if (String(args.confirmEnvironment || "") !== conn.environment) {
    throw new Error("confirmEnvironment must match connection environment");
  }
  const backupVerifiedId = args.backupVerifiedId
    ? String(args.backupVerifiedId)
    : undefined;
  if (backupVerifiedId) {
    assertBackupVerified(conn.id, backupVerifiedId);
  }
  const a = createDbApproval({
    principalId: principal.id,
    connectionId: conn.id,
    environment: conn.environment,
    actions: Array.isArray(args.actions)
      ? (args.actions.map(String) as DbApprovalAction[])
      : undefined,
    backupVerifiedId,
    ttlMs: args.ttlMs ? Number(args.ttlMs) : undefined,
    uses: args.uses ? Number(args.uses) : undefined,
  });
  return {
    approvalId: a.id,
    connectionId: a.connectionId,
    environment: a.environment,
    actions: a.actions,
    backupVerifiedId: a.backupVerifiedId || null,
    expiresAt: new Date(a.expiresAt).toISOString(),
    usesLeft: a.usesLeft,
  };
}
