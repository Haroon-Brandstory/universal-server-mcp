import type { ServiceProfile } from "./types.js";

const SAFE_NAME = /^[A-Za-z0-9@._:-]+$/;

export function assertSafeServiceName(name: string): string {
  const n = String(name || "").trim();
  if (!n || n.length > 128 || !SAFE_NAME.test(n)) {
    throw new Error(`Invalid service name: ${name}`);
  }
  if (n.includes("..") || n.includes("/") || n.includes(" ")) {
    throw new Error(`Invalid service name: ${name}`);
  }
  return n;
}

/** Prefer MCP_PM2_BIN=/usr/local/sbin/bsd-pm2 or /host-nodejs/bin/pm2 in Docker. */
export function pm2Bin(): string {
  const b = String(process.env.MCP_PM2_BIN || "").trim();
  return b || "pm2";
}

export function npmBin(): string {
  const b = String(process.env.MCP_NPM_BIN || "").trim();
  return b || "npm";
}

export function nextjsPm2AppName(): string {
  return assertSafeServiceName(
    process.env.MCP_PM2_NEXTJS_NAME || "frontend-nextjs"
  );
}

export function strapiPm2AppName(): string {
  return assertSafeServiceName(
    process.env.MCP_PM2_STRAPI_NAME || "strapi-backend"
  );
}

/** Host ctl client (container). Writes /mcp-host-ctl; systemd runs bsdglobal pm2. */
export function pm2RestartRequestBin(): string {
  const b = String(process.env.MCP_PM2_RESTART_BIN || "").trim();
  return b || "/usr/local/sbin/bsd-mcp-request";
}

/** Extensible service profiles — not hardcoded in gateway. */
export const SERVICE_PROFILES: Record<string, ServiceProfile> = {
  nginx: {
    id: "nginx",
    statusArgv: ["systemctl", "is-active", "nginx"],
    healthArgv: ["nginx", "-t"],
    logsArgv: (_name, lines) => [
      "journalctl",
      "-u",
      "nginx",
      "-n",
      String(lines),
      "--no-pager",
    ],
    restartArgv: () => ["sudo", "-n", "/bin/systemctl", "restart", "nginx"],
    cacheClearArgv: ["sudo", "-n", "/usr/sbin/nginx", "-s", "reload"],
  },
  apache: {
    id: "apache",
    statusArgv: ["systemctl", "is-active", "apache2"],
    healthArgv: ["apache2ctl", "configtest"],
    logsArgv: (_name, lines) => [
      "journalctl",
      "-u",
      "apache2",
      "-n",
      String(lines),
      "--no-pager",
    ],
    restartArgv: () => ["sudo", "-n", "/bin/systemctl", "restart", "apache2"],
  },
  systemd: {
    id: "systemd",
    statusArgv: ["systemctl", "is-system-running"],
    logsArgv: (name, lines) => [
      "journalctl",
      "-u",
      assertSafeServiceName(name),
      "-n",
      String(lines),
      "--no-pager",
    ],
    restartArgv: (name) => [
      "sudo",
      "-n",
      "/bin/systemctl",
      "restart",
      assertSafeServiceName(name),
    ],
  },
  pm2: {
    id: "pm2",
    // Placeholder — getProfile() rebuilds with live MCP_PM2_* env.
    statusArgv: ["pm2", "jlist"],
    logsArgv: (name, lines) => [
      pm2Bin(),
      "logs",
      assertSafeServiceName(name),
      "--lines",
      String(lines),
      "--nostream",
    ],
    restartArgv: (name) => [
      pm2Bin(),
      "restart",
      assertSafeServiceName(name),
    ],
  },
  docker: {
    id: "docker",
    statusArgv: ["docker", "ps", "--format", "{{.Names}} {{.Status}}"],
    logsArgv: (name, lines) => [
      "docker",
      "logs",
      "--tail",
      String(lines),
      assertSafeServiceName(name),
    ],
    restartArgv: (name) => ["docker", "restart", assertSafeServiceName(name)],
  },
  nextjs: {
    id: "nextjs",
    statusArgv: ["pm2", "describe", "frontend-nextjs"],
    healthArgv: ["pm2", "pid", "frontend-nextjs"],
    restartArgv: () => [pm2Bin(), "restart", nextjsPm2AppName()],
  },
  strapi: {
    id: "strapi",
    statusArgv: ["pm2", "describe", "strapi-backend"],
    healthArgv: ["pm2", "pid", "strapi-backend"],
    restartArgv: () => [pm2Bin(), "restart", strapiPm2AppName()],
  },
  postgres: {
    id: "postgres",
    statusArgv: ["systemctl", "is-active", "postgresql"],
    healthArgv: ["pg_isready"],
    // No restart by default in profile — must be explicitly approved maintenance id
  },
};

function resolvePm2Profile(id: "pm2" | "nextjs" | "strapi"): ServiceProfile {
  const bin = pm2Bin();
  if (id === "pm2") {
    return {
      id: "pm2",
      statusArgv: [bin, "jlist"],
      logsArgv: (name, lines) => [
        bin,
        "logs",
        assertSafeServiceName(name),
        "--lines",
        String(lines),
        "--nostream",
      ],
      restartArgv: (name) => [bin, "restart", assertSafeServiceName(name)],
    };
  }
  if (id === "nextjs") {
    const app = nextjsPm2AppName();
    const req = pm2RestartRequestBin();
    return {
      id: "nextjs",
      statusArgv: [bin, "describe", app],
      healthArgv: [bin, "pid", app],
      // Never call host pm2 socket as uid 10001 — host agent restarts as bsdglobal.
      restartArgv: () => [req, "nextjs"],
    };
  }
  const app = strapiPm2AppName();
  const req = pm2RestartRequestBin();
  return {
    id: "strapi",
    statusArgv: [bin, "describe", app],
    healthArgv: [bin, "pid", app],
    restartArgv: () => [req, "strapi"],
  };
}

export function getProfile(id: string): ServiceProfile {
  if (id === "pm2" || id === "nextjs" || id === "strapi") {
    return resolvePm2Profile(id);
  }
  const p = SERVICE_PROFILES[id];
  if (!p) throw new Error(`Unsupported service profile: ${id}`);
  return p;
}

export function registerServiceProfile(profile: ServiceProfile): void {
  if (!profile?.id) throw new Error("Invalid service profile");
  SERVICE_PROFILES[profile.id] = profile;
}
