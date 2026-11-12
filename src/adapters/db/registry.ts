import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument, Principal } from "../../types.js";
import { publicCredentialView } from "./credentials.js";
import type { DatabasesDocument, DbConnectionRecord } from "./types.js";

export function databasesPath(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.databaseops?.databases_path ||
      process.env.MCP_DATABASES_PATH ||
      "./config/databases.yaml"
  );
}

export function loadDatabasesDocument(
  policy: PolicyDocument
): DatabasesDocument {
  const path = databasesPath(policy);
  if (!existsSync(path)) {
    return { version: 1, connections: [] };
  }
  const doc = parseYaml(readFileSync(path, "utf8")) as DatabasesDocument;
  if (!doc?.connections || !Array.isArray(doc.connections)) {
    throw new Error(`Invalid databases registry at ${path}`);
  }
  return doc;
}

export function listAccessibleConnections(
  policy: PolicyDocument,
  principal: Principal
): DbConnectionRecord[] {
  const doc = loadDatabasesDocument(policy);
  const projects = new Set(principal.projects || []);
  return doc.connections.filter((c) => {
    if (c.enabled === false) return false;
    if (!projects.has(c.project_id)) return false;
    return true;
  });
}

export function getAccessibleConnection(
  policy: PolicyDocument,
  principal: Principal,
  connectionId: string
): DbConnectionRecord {
  const c = listAccessibleConnections(policy, principal).find(
    (x) => x.id === connectionId
  );
  if (!c) {
    throw new Error(`Database connection not found or not authorized: ${connectionId}`);
  }
  return c;
}

export function publicConnectionView(c: DbConnectionRecord) {
  return {
    id: c.id,
    label: c.label || c.id,
    projectId: c.project_id,
    environment: c.environment,
    engine: c.engine,
    allowedDatabases: c.allowed_databases,
    allowedSchemas: c.allowed_schemas,
    permissions: c.permissions,
    queryLimits: c.query_limits || {},
    credentials: {
      read: publicCredentialView(c.credentials.read),
      write: c.credentials.write
        ? publicCredentialView(c.credentials.write)
        : null,
    },
    hasMigrationsPath: Boolean(c.migrations_path),
  };
}
