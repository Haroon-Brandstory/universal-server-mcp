import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument, Principal } from "../../types.js";
import type { ServerRecord, ServersDocument } from "./types.js";

export function serversPath(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.serverops?.servers_path ||
      process.env.MCP_SERVERS_PATH ||
      "./config/servers.yaml"
  );
}

export function loadServersDocument(policy: PolicyDocument): ServersDocument {
  const path = serversPath(policy);
  if (!existsSync(path)) {
    return { version: 1, servers: [] };
  }
  const doc = parseYaml(readFileSync(path, "utf8")) as ServersDocument;
  if (!doc?.servers || !Array.isArray(doc.servers)) {
    throw new Error(`Invalid servers registry at ${path}`);
  }
  return doc;
}

export function listAccessibleServers(
  policy: PolicyDocument,
  principal: Principal
): ServerRecord[] {
  const doc = loadServersDocument(policy);
  const projects = new Set(principal.projects || []);
  return doc.servers.filter((s) => {
    if (s.enabled === false) return false;
    if (!projects.has(s.project_id)) return false;
    return true;
  });
}

export function getAccessibleServer(
  policy: PolicyDocument,
  principal: Principal,
  serverId: string
): ServerRecord {
  const server = listAccessibleServers(policy, principal).find(
    (s) => s.id === serverId
  );
  if (!server) {
    throw new Error(`Server not found or not authorized: ${serverId}`);
  }
  return server;
}

/** Public safe view — no key paths or secrets. */
export function publicServerView(s: ServerRecord) {
  return {
    id: s.id,
    label: s.label || s.id,
    projectId: s.project_id,
    environment: s.environment,
    host: s.connection.host,
    port: s.connection.port || 22,
    user: s.connection.user,
    method: s.connection.method,
    services: s.services,
    approvedMaintenance: s.approved_maintenance,
    monitoring: {
      sslHosts: s.monitoring?.ssl_hosts || [],
      healthUrlCount: s.monitoring?.health_urls?.length || 0,
      logSources: s.monitoring?.log_sources || [],
    },
  };
}
