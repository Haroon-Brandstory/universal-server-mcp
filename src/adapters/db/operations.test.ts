import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { PolicyDocument, Principal } from "../../types.js";
import { setEndpointForTests } from "./credentials.js";
import { setDbDriverForTests } from "./drivers/index.js";
import {
  MockDbDriver,
  createDefaultMockState,
} from "./drivers/mock.js";
import { resetDbApprovalsForTests } from "./approval.js";
import { resetDbControlsForTests } from "./controls.js";
import { assertReadOnlySql } from "./sqlGuard.js";
import {
  approvalCreate,
  backupStatus,
  health,
  listConnections,
  migrationApply,
  migrationPlan,
  migrationValidate,
  queryRead,
  restorePlan,
  schemas,
  tables,
} from "./operations.js";

const fixturesDb = resolve(process.cwd(), "fixtures/databaseops/databases.yaml");

const policy: PolicyDocument = {
  version: 1,
  environment: "development",
  kill_switch: false,
  rate_limit_per_min: 60,
  projects: [{ id: "app", allow_hosts: [], allow_paths: [] }],
  principals: [],
  deny_hosts: [],
  ssrf: {
    block_private: true,
    block_loopback: false,
    block_link_local: true,
    block_metadata: true,
  },
  databaseops: {
    enabled: true,
    databases_path: fixturesDb,
    require_migration_approval: true,
    require_backup_before_destructive: true,
    allow_production_migrations: false,
    default_max_rows: 100,
    default_statement_timeout_ms: 2000,
    migration_rate_limit_per_min: 10,
  },
};

function principal(partial: Partial<Principal> & { id: string }): Principal {
  return {
    roles: [],
    allow_hosts: [],
    capabilities: [],
    allow_methods: ["GET"],
    write: false,
    max_response_bytes: 65536,
    projects: ["app"],
    ...partial,
  };
}

const ep = {
  host: "127.0.0.1",
  port: 5432,
  user: "reader",
  password: "secret-should-never-leak",
  database: "testdb",
  ssl: false,
};

afterEach(() => {
  setDbDriverForTests(null);
  setEndpointForTests(null);
  resetDbApprovalsForTests();
  resetDbControlsForTests();
});

describe("sqlGuard", () => {
  it("allows SELECT/WITH only", () => {
    assert.equal(assertReadOnlySql("SELECT 1", 100), "SELECT 1");
    assert.throws(() => assertReadOnlySql("DELETE FROM users", 100));
    assert.throws(() => assertReadOnlySql("SELECT 1; DROP TABLE x", 100));
    assert.throws(() => assertReadOnlySql("INSERT INTO t VALUES (1)", 100));
  });
});

describe("db authorization", () => {
  it("lists only project connections and hides secrets", () => {
    const out = listConnections(policy, principal({ id: "op" }));
    const ids = out.connections.map((c) => c.id).sort();
    assert.ok(ids.includes("mock-pg"));
    assert.ok(ids.includes("mock-mysql"));
    assert.ok(!ids.includes("other-db"));
    const blob = JSON.stringify(out);
    assert.ok(!blob.includes("secret"));
    assert.ok(!blob.includes("password_env") || blob.includes("passwordEnv"));
    assert.ok(!blob.includes("secret-should"));
  });
});

describe("read path (mock PG/MySQL drivers)", () => {
  it("health schemas tables query with redaction + row limit", async () => {
    const state = createDefaultMockState();
    setDbDriverForTests(new MockDbDriver(state));
    setEndpointForTests(ep);
    const p = principal({ id: "op" });

    const h = await health(policy, p, { connectionId: "mock-pg" });
    assert.equal(h.ok, true);
    assert.equal(h.database, "testdb");
    assert.ok(!JSON.stringify(h).includes("secret-should"));

    const s = await schemas(policy, p, { connectionId: "mock-pg" });
    assert.deepEqual(s.schemas.sort(), ["app", "public"]);

    const t = await tables(policy, p, {
      connectionId: "mock-pg",
      schema: "public",
    });
    assert.ok(t.tables.includes("users"));

    await assert.rejects(
      () =>
        tables(policy, p, { connectionId: "mock-pg", schema: "secret_schema" }),
      /not allowlisted/
    );

    const q = await queryRead(policy, p, {
      connectionId: "mock-pg",
      sql: "SELECT id, email, password FROM users",
    });
    assert.equal(q.rows.length, 2);
    assert.equal(q.rows[0]?.password, "[REDACTED]");
    assert.ok(!JSON.stringify(q.rows).includes("secret"));

    await assert.rejects(
      () =>
        queryRead(policy, p, {
          connectionId: "mock-pg",
          sql: "DELETE FROM users",
        }),
      /forbidden|SELECT/
    );
  });

  it("reports connection failures", async () => {
    const state = createDefaultMockState();
    state.failConnect = true;
    setDbDriverForTests(new MockDbDriver(state));
    setEndpointForTests(ep);
    const h = await health(policy, principal({ id: "op" }), {
      connectionId: "mock-mysql",
    });
    assert.equal(h.ok, false);
  });
});

describe("migration + backup safeguards", () => {
  it("plans and validates; rejects DROP DATABASE file", () => {
    const p = principal({ id: "op", write: true, admin: true });
    const plan = migrationPlan(policy, p, { connectionId: "mock-pg" });
    assert.ok(plan.migrations.length >= 1);

    const bad = migrationValidate(policy, p, {
      connectionId: "mock-pg",
      migrationId: "000_drop_database_forbidden",
    });
    assert.equal(bad.ok, false);

    const good = migrationValidate(policy, p, {
      connectionId: "mock-pg",
      migrationId: "001_add_migrated",
    });
    assert.equal(good.ok, true);
  });

  it("apply requires backup verification + approval; blocks production", async () => {
    const state = createDefaultMockState();
    setDbDriverForTests(new MockDbDriver(state));
    setEndpointForTests(ep);
    const p = principal({ id: "op", write: true, admin: true });

    await assert.rejects(
      () =>
        migrationApply(policy, p, {
          connectionId: "mock-pg",
          migrationId: "001_add_migrated",
          confirmConnectionId: "mock-pg",
          confirmEnvironment: "development",
        }),
      /approvalId/
    );

    const backup = await backupStatus(policy, p, { connectionId: "mock-pg" });
    assert.ok(backup.backupVerifiedId);

    const a = approvalCreate(p, policy, {
      connectionId: "mock-pg",
      confirmEnvironment: "development",
      backupVerifiedId: backup.backupVerifiedId,
      actions: ["migration.apply"],
    });

    const applied = await migrationApply(policy, p, {
      connectionId: "mock-pg",
      migrationId: "001_add_migrated",
      approvalId: a.approvalId,
      confirmConnectionId: "mock-pg",
      confirmEnvironment: "development",
    });
    assert.equal(applied.ok, true);
    assert.ok(state.applied.length >= 1);
    assert.ok(state.tables.public.includes("migrated"));

    await assert.rejects(
      () =>
        migrationApply(policy, p, {
          connectionId: "prod-blocked",
          migrationId: "001_add_migrated",
          approvalId: "x",
          confirmConnectionId: "prod-blocked",
          confirmEnvironment: "production",
        }),
      /Production migrations blocked/
    );
  });

  it("restore is plan-only", () => {
    const out = restorePlan(policy, principal({ id: "op" }), {
      connectionId: "mock-pg",
    });
    assert.equal(out.executableViaMcp, false);
  });
});

describe("optional live PG/MySQL", () => {
  it("postgresql isolated DB when TEST_DATABASE_URL set", async () => {
    const url = process.env.TEST_DATABASE_URL || process.env.TEST_PG_URL;
    if (!url) {
      assert.ok(true, "skip — no TEST_DATABASE_URL");
      return;
    }
    setDbDriverForTests(null);
    setEndpointForTests(null);
    process.env.TEST_PG_URL = url;
    // Use url_env path via temporary policy connection would need registry change;
    // direct driver smoke:
    const { PostgresDriver } = await import("./drivers/postgres.js");
    const { resolveEndpoint } = await import("./credentials.js");
    process.env.LIVE_PG_URL = url;
    const epLive = resolveEndpoint({
      url_env: "LIVE_PG_URL",
      user_env: "x",
      password_env: "x",
    });
    const d = new PostgresDriver();
    const h = await d.health(epLive, 5000);
    assert.equal(h.ok, true);
    const q = await d.queryRead(epLive, "SELECT 1 AS n", [], {
      max_rows: 10,
      max_result_bytes: 1000,
      statement_timeout_ms: 3000,
      max_sql_chars: 100,
    });
    assert.equal(Number(q.rows[0]?.n), 1);
  });

  it("mysql isolated DB when TEST_MYSQL_URL set", async () => {
    const url = process.env.TEST_MYSQL_URL;
    if (!url) {
      assert.ok(true, "skip — no TEST_MYSQL_URL");
      return;
    }
    setDbDriverForTests(null);
    process.env.LIVE_MYSQL_URL = url;
    const { MysqlDriver } = await import("./drivers/mysql.js");
    const { resolveEndpoint } = await import("./credentials.js");
    const epLive = resolveEndpoint({
      url_env: "LIVE_MYSQL_URL",
      user_env: "x",
      password_env: "x",
    });
    const d = new MysqlDriver();
    const h = await d.health(epLive, 5000);
    assert.equal(h.ok, true);
  });
});
