import type { DbDriver, DbEngine } from "../types.js";
import { PostgresDriver } from "./postgres.js";
import { createMariaDbDriver, MysqlDriver } from "./mysql.js";

const IMPLEMENTED: Partial<Record<DbEngine, () => DbDriver>> = {
  postgresql: () => new PostgresDriver(),
  mysql: () => new MysqlDriver(),
  mariadb: () => createMariaDbDriver(),
};

let override: DbDriver | null = null;

export function setDbDriverForTests(d: DbDriver | null): void {
  override = d;
}

export function getDbDriver(engine: DbEngine): DbDriver {
  if (override) return override;
  const factory = IMPLEMENTED[engine];
  if (!factory) {
    throw new Error(
      `Database engine not implemented: ${engine}. Supported: ${Object.keys(IMPLEMENTED).join(", ")}`
    );
  }
  return factory();
}

export function implementedEngines(): DbEngine[] {
  return Object.keys(IMPLEMENTED) as DbEngine[];
}
