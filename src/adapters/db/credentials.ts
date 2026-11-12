import type { DbCredentialRefs, ResolvedDbEndpoint } from "./types.js";

let endpointOverride: ResolvedDbEndpoint | null = null;

/** Test-only: skip env resolution (never expose secrets via MCP). */
export function setEndpointForTests(ep: ResolvedDbEndpoint | null): void {
  endpointOverride = ep;
}

/** Resolve endpoint from env refs. Never log or return password/url. */
export function resolveEndpoint(refs: DbCredentialRefs): ResolvedDbEndpoint {
  if (endpointOverride) return { ...endpointOverride };

  if (refs.url_env) {
    const url = process.env[refs.url_env];
    if (!url) throw new Error(`DB credential env missing: ${refs.url_env}`);
    try {
      const u = new URL(url);
      return {
        host: u.hostname,
        port: u.port
          ? Number(u.port)
          : u.protocol.startsWith("mysql")
            ? 3306
            : 5432,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, "") || process.env[refs.database_env || ""] || "",
        ssl:
          u.searchParams.get("sslmode") === "require" ||
          process.env[refs.ssl_env || ""] === "1",
        url,
      };
    } catch {
      throw new Error(`Invalid database URL in ${refs.url_env}`);
    }
  }

  const hostEnv = refs.host_env;
  if (!hostEnv || !process.env[hostEnv]) {
    throw new Error(`DB host env missing: ${hostEnv || "(unset)"}`);
  }
  const user = process.env[refs.user_env];
  const password = process.env[refs.password_env];
  if (!user) throw new Error(`DB user env missing: ${refs.user_env}`);
  if (password === undefined) {
    throw new Error(`DB password env missing: ${refs.password_env}`);
  }
  const database = refs.database_env
    ? process.env[refs.database_env] || ""
    : "";
  if (!database) throw new Error("DB database name env missing");

  const portRaw = refs.port_env ? process.env[refs.port_env] : undefined;
  return {
    host: process.env[hostEnv]!,
    port: portRaw ? Number(portRaw) : 5432,
    user,
    password,
    database,
    ssl: process.env[refs.ssl_env || ""] === "1",
  };
}

/** Safe public view of credential wiring (env names only). */
export function publicCredentialView(refs: DbCredentialRefs) {
  return {
    hostEnv: refs.host_env || null,
    portEnv: refs.port_env || null,
    userEnv: refs.user_env,
    passwordEnv: refs.password_env,
    databaseEnv: refs.database_env || null,
    urlEnv: refs.url_env || null,
    sslEnv: refs.ssl_env || null,
  };
}
