import type { PolicyEnvironment } from "../../types.js";

export type ServerConnectionMethod = "ssh" | "mock";

export interface ServerConnection {
  method: ServerConnectionMethod;
  host: string;
  port?: number;
  /** Non-root service account. */
  user: string;
  /** Env var holding absolute path to private key PEM. */
  private_key_path_env?: string;
  /** Env var holding known_hosts file path (required for ssh). */
  known_hosts_path_env?: string;
}

export interface ServerMonitoringConfig {
  /** Hostnames for SSL expiry checks (exact). */
  ssl_hosts?: string[];
  /** Allowlisted health URLs only (exact) — never AI-supplied. */
  health_urls?: string[];
  log_sources?: string[];
}

export interface ServerRecord {
  id: string;
  project_id: string;
  environment: PolicyEnvironment;
  connection: ServerConnection;
  /** Service profile ids (nginx, pm2, nextjs, strapi, …). */
  services: string[];
  /** Allowed maintenance action ids. */
  approved_maintenance: string[];
  monitoring?: ServerMonitoringConfig;
  /** Human label only. */
  label?: string;
  enabled?: boolean;
}

export interface ServersDocument {
  version: number;
  servers: ServerRecord[];
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ServerTransport {
  exec(
    server: ServerRecord,
    argv: string[],
    opts: { timeoutMs: number }
  ): Promise<ExecResult>;
}

export interface ServiceProfile {
  id: string;
  /** Read-only status probe (fixed argv). */
  statusArgv: string[];
  /** Optional log tail — unit/name validated by caller. */
  logsArgv?: (name: string, lines: number) => string[];
  /** Restart only if profile supports it; name validated. */
  restartArgv?: (name: string) => string[];
  /** Optional cache clear. */
  cacheClearArgv?: string[];
  /** Extra health probe. */
  healthArgv?: string[];
}
