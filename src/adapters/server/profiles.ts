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
    statusArgv: ["pm2", "jlist"],
    logsArgv: (name, lines) => [
      "pm2",
      "logs",
      assertSafeServiceName(name),
      "--lines",
      String(lines),
      "--nostream",
    ],
    restartArgv: (name) => ["pm2", "restart", assertSafeServiceName(name)],
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
    // Profile assumes PM2/systemd unit naming left to server registry health_urls / pm2
    statusArgv: ["pm2", "describe", "nextjs"],
    healthArgv: ["pm2", "pid", "nextjs"],
    restartArgv: () => ["pm2", "restart", "nextjs"],
  },
  strapi: {
    id: "strapi",
    statusArgv: ["pm2", "describe", "strapi"],
    healthArgv: ["pm2", "pid", "strapi"],
    restartArgv: () => ["pm2", "restart", "strapi"],
  },
  postgres: {
    id: "postgres",
    statusArgv: ["systemctl", "is-active", "postgresql"],
    healthArgv: ["pg_isready"],
    // No restart by default in profile — must be explicitly approved maintenance id
  },
};

export function getProfile(id: string): ServiceProfile {
  const p = SERVICE_PROFILES[id];
  if (!p) throw new Error(`Unsupported service profile: ${id}`);
  return p;
}

export function registerServiceProfile(profile: ServiceProfile): void {
  if (!profile?.id) throw new Error("Invalid service profile");
  SERVICE_PROFILES[profile.id] = profile;
}
