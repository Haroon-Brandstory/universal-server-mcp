import { randomUUID } from "node:crypto";
import type { PolicyDocument, Principal } from "../../types.js";
import {
  pendingApprovalNext,
  requireOperatorTokenConfigured,
} from "../../auth/operatorToken.js";
import { redactText } from "../../security/redact.js";
import {
  getAccessibleServer,
  listAccessibleServers,
  publicServerView,
} from "./registry.js";
import { getServerTransport } from "./transport.js";
import { assertSafeServiceName, getProfile } from "./profiles.js";
import {
  consumeServerApproval,
  createServerApproval,
  type ServerMaintenanceAction,
} from "./approval.js";
import {
  acquireServerLock,
  checkMaintenanceRate,
  releaseServerLock,
} from "./controls.js";
import type { ExecResult, ServerRecord } from "./types.js";

function timeoutMs(policy: PolicyDocument): number {
  return (policy.serverops?.default_timeout_sec || 30) * 1000;
}

function maxLog(policy: PolicyDocument, principal: Principal): number {
  return Math.min(
    policy.serverops?.max_log_bytes || 64_000,
    principal.max_response_bytes
  );
}

function sanitizeOut(text: string, max: number): string {
  return redactText(text, max);
}

async function runProbe(
  policy: PolicyDocument,
  server: ServerRecord,
  argv: string[]
): Promise<ExecResult> {
  const transport = getServerTransport(server);
  return transport.exec(server, argv, { timeoutMs: timeoutMs(policy) });
}

function requireServerOpsEnabled(policy: PolicyDocument): void {
  if (policy.serverops?.enabled === false) {
    throw new Error("ServerOps disabled in policy");
  }
}

function assertMaintenanceAllowed(
  server: ServerRecord,
  actionId: string
): void {
  if (!server.approved_maintenance.includes(actionId)) {
    throw new Error(
      `Maintenance action not approved for server ${server.id}: ${actionId}`
    );
  }
}

function requireMaintApproval(
  policy: PolicyDocument,
  principal: Principal,
  server: ServerRecord,
  action: ServerMaintenanceAction,
  args: Record<string, unknown>
): void {
  if (policy.serverops?.require_maintenance_approval === false) {
    // still require explicit confirms
  } else {
    const approvalId = String(args.approvalId || "");
    if (!approvalId) {
      throw new Error(
        "approvalId required for maintenance. Create via server.approval.create"
      );
    }
    consumeServerApproval({
      approvalId,
      principalId: principal.id,
      serverId: server.id,
      environment: server.environment,
      action,
      confirmServerId: String(args.confirmServerId || ""),
      confirmEnvironment: String(args.confirmEnvironment || ""),
    });
    return;
  }
  if (
    String(args.confirmServerId || "") !== server.id ||
    String(args.confirmEnvironment || "") !== server.environment
  ) {
    throw new Error("confirmServerId/confirmEnvironment required");
  }
}

export function listServers(policy: PolicyDocument, principal: Principal) {
  requireServerOpsEnabled(policy);
  return {
    servers: listAccessibleServers(policy, principal).map(publicServerView),
  };
}

export async function health(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const max = maxLog(policy, principal);
  const uptime = await runProbe(policy, server, ["uptime"]);
  const load = await runProbe(policy, server, ["cat", "/proc/loadavg"]);
  const services: Record<string, unknown> = {};
  for (const sid of server.services) {
    try {
      const profile = getProfile(sid);
      const r = await runProbe(policy, server, profile.statusArgv);
      services[sid] = {
        ok: r.code === 0,
        status: sanitizeOut((r.stdout || r.stderr).trim(), 2000),
      };
    } catch (err) {
      services[sid] = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const appHealth: Array<{ url: string; ok: boolean; detail: string }> = [];
  for (const url of server.monitoring?.health_urls || []) {
    // Curated remote curl to allowlisted URL only
    const r = await runProbe(policy, server, [
      "curl",
      "-fsS",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--max-time",
      "5",
      url,
    ]);
    appHealth.push({
      url,
      ok: r.code === 0 && /^2\d\d$/.test(r.stdout.trim()),
      detail: sanitizeOut(r.stdout.trim() || r.stderr.trim(), 200),
    });
  }

  return {
    serverId: server.id,
    environment: server.environment,
    uptime: sanitizeOut(uptime.stdout.trim(), 500),
    loadavg: sanitizeOut(load.stdout.trim(), 200),
    services,
    appHealth,
  };
}

export async function metrics(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const max = maxLog(policy, principal);
  const [mem, disk, cpu] = await Promise.all([
    runProbe(policy, server, ["free", "-m"]),
    runProbe(policy, server, ["df", "-h", "/"]),
    runProbe(policy, server, ["cat", "/proc/stat"]),
  ]);
  return {
    serverId: server.id,
    memory: sanitizeOut(mem.stdout, max),
    disk: sanitizeOut(disk.stdout, max),
    cpuStatHead: sanitizeOut(cpu.stdout.split("\n").slice(0, 5).join("\n"), 2000),
  };
}

export async function services(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const out: Record<string, unknown> = {};
  for (const sid of server.services) {
    const profile = getProfile(sid);
    const r = await runProbe(policy, server, profile.statusArgv);
    out[sid] = {
      active: r.code === 0,
      raw: sanitizeOut((r.stdout || r.stderr).trim(), 4000),
    };
  }
  return { serverId: server.id, services: out };
}

export async function serviceStatus(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const service = String(args.service || "");
  if (!server.services.includes(service)) {
    throw new Error(`Service profile not enabled on server: ${service}`);
  }
  const profile = getProfile(service);
  const r = await runProbe(policy, server, profile.statusArgv);
  let health = null;
  if (profile.healthArgv) {
    const h = await runProbe(policy, server, profile.healthArgv);
    health = {
      ok: h.code === 0,
      detail: sanitizeOut((h.stdout || h.stderr).trim(), 2000),
    };
  }
  return {
    serverId: server.id,
    service,
    ok: r.code === 0,
    status: sanitizeOut((r.stdout || r.stderr).trim(), 4000),
    health,
  };
}

export async function logsRead(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const service = String(args.service || "");
  if (!server.services.includes(service)) {
    throw new Error(`Service profile not enabled on server: ${service}`);
  }
  const profile = getProfile(service);
  if (!profile.logsArgv) {
    throw new Error(`Service ${service} does not support logs.read`);
  }
  const name = args.name ? assertSafeServiceName(String(args.name)) : service;
  const lines = Math.min(Math.max(Number(args.lines || 100), 1), 500);
  const r = await runProbe(policy, server, profile.logsArgv(name, lines));
  return {
    serverId: server.id,
    service,
    log: sanitizeOut(r.stdout || r.stderr, maxLog(policy, principal)),
  };
}

export async function sslStatus(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const hosts = server.monitoring?.ssl_hosts || [];
  if (!hosts.length) {
    return { serverId: server.id, certificates: [], note: "no ssl_hosts configured" };
  }
  const certificates = [];
  for (const host of hosts) {
    // openssl s_client via curated argv — host from registry only
    if (!/^[A-Za-z0-9.-]+$/.test(host)) {
      throw new Error(`Invalid ssl host in registry: ${host}`);
    }
    const r = await runProbe(policy, server, [
      "openssl",
      "s_client",
      "-servername",
      host,
      "-connect",
      `${host}:443`,
      "-brief",
    ]);
    certificates.push({
      host,
      ok: r.code === 0,
      detail: sanitizeOut(r.stdout.trim() || r.stderr.trim(), 2000),
    });
  }
  return { serverId: server.id, certificates };
}

export async function diskStatus(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const r = await runProbe(policy, server, ["df", "-h"]);
  return {
    serverId: server.id,
    disk: sanitizeOut(r.stdout, maxLog(policy, principal)),
  };
}

export async function processes(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const r = await runProbe(policy, server, [
    "ps",
    "ax",
    "-o",
    "pid,user,%cpu,%mem,etime,cmd",
    "--sort=-%cpu",
  ]);
  // Truncate process list
  const lines = r.stdout.split("\n").slice(0, 40).join("\n");
  return {
    serverId: server.id,
    processes: sanitizeOut(lines, maxLog(policy, principal)),
  };
}

export async function securityStatus(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  const [unattended, fail2ban, sshd] = await Promise.all([
    runProbe(policy, server, ["systemctl", "is-active", "unattended-upgrades"]).catch(
      () => ({ code: 1, stdout: "", stderr: "n/a", durationMs: 0 })
    ),
    runProbe(policy, server, ["systemctl", "is-active", "fail2ban"]).catch(() => ({
      code: 1,
      stdout: "",
      stderr: "n/a",
      durationMs: 0,
    })),
    runProbe(policy, server, ["systemctl", "is-active", "ssh"]).catch(() =>
      runProbe(policy, server, ["systemctl", "is-active", "sshd"])
    ),
  ]);
  return {
    serverId: server.id,
    environment: server.environment,
    checks: {
      unattendedUpgrades: sanitizeOut(unattended.stdout.trim() || "inactive", 100),
      fail2ban: sanitizeOut(fail2ban.stdout.trim() || "inactive", 100),
      ssh: sanitizeOut(sshd.stdout.trim() || "unknown", 100),
      rootLoginAutomation: "forbidden",
      passwordAuthAutomation: "disabled",
    },
  };
}

async function withMaintenanceLock<T>(
  policy: PolicyDocument,
  server: ServerRecord,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  const opId = randomUUID();
  checkMaintenanceRate(
    server.id,
    policy.serverops?.maintenance_rate_limit_per_min || 5
  );
  acquireServerLock(server.id, opId);
  try {
    return await fn();
  } finally {
    releaseServerLock(server.id, opId);
  }
}

export async function serviceRestart(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  if (!principal.write) throw new Error("Principal write=false");
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  assertMaintenanceAllowed(server, "service.restart");
  requireMaintApproval(policy, principal, server, "service.restart", args);

  const service = String(args.service || "");
  if (!server.services.includes(service)) {
    throw new Error(`Unsupported/unlisted service on server: ${service}`);
  }
  const profile = getProfile(service);
  if (!profile.restartArgv) {
    throw new Error(`Service ${service} does not allow restart`);
  }
  const unit = args.name ? assertSafeServiceName(String(args.name)) : service;

  return withMaintenanceLock(policy, server, "restart", async () => {
    const before = await runProbe(policy, server, profile.statusArgv);
    const restart = await runProbe(policy, server, profile.restartArgv!(unit));
    const after = await runProbe(policy, server, profile.statusArgv);
    return {
      serverId: server.id,
      environment: server.environment,
      service,
      before: sanitizeOut((before.stdout || before.stderr).trim(), 1000),
      restartExit: restart.code,
      after: sanitizeOut((after.stdout || after.stderr).trim(), 1000),
    };
  });
}

export async function cacheClear(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  if (!principal.write) throw new Error("Principal write=false");
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  assertMaintenanceAllowed(server, "cache.clear");
  requireMaintApproval(policy, principal, server, "cache.clear", args);
  const service = String(args.service || "nginx");
  if (!server.services.includes(service)) {
    throw new Error(`Unsupported service for cache.clear: ${service}`);
  }
  const profile = getProfile(service);
  if (!profile.cacheClearArgv) {
    throw new Error(`Service ${service} has no cache.clear action`);
  }
  return withMaintenanceLock(policy, server, "cache", async () => {
    const r = await runProbe(policy, server, profile.cacheClearArgv!);
    return {
      serverId: server.id,
      service,
      ok: r.code === 0,
      detail: sanitizeOut((r.stdout || r.stderr).trim(), 2000),
    };
  });
}

/** Constrained maintenance actions only — never arbitrary shell. */
const MAINTENANCE_ACTIONS: Record<string, (server: ServerRecord) => string[]> = {
  "nginx.reload": () => ["sudo", "-n", "/usr/sbin/nginx", "-s", "reload"],
  "pm2.save": () => ["pm2", "save"],
  "disk.inode.check": () => ["df", "-i", "/"],
  /** Live Next.js rebuild (BSD Global FE path). */
  "nextjs.build": () => [
    "npm",
    "--prefix",
    "/var/www/html/global-brandstory",
    "run",
    "build",
  ],
  /** Live Strapi rebuild (BSD Global BE path). */
  "strapi.build": () => [
    "npm",
    "--prefix",
    "/var/www/html/global-backend/bsd-strapi",
    "run",
    "build",
  ],
};

export async function maintenanceRun(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  if (!principal.write) throw new Error("Principal write=false");
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  assertMaintenanceAllowed(server, "maintenance.run");
  requireMaintApproval(policy, principal, server, "maintenance.run", args);

  const action = String(args.action || "");
  const factory = MAINTENANCE_ACTIONS[action];
  if (!factory) {
    throw new Error(
      `Unsupported maintenance action: ${action}. Allowed: ${Object.keys(MAINTENANCE_ACTIONS).join(", ")}`
    );
  }
  // Server must also list the concrete action or generic maintenance.run
  if (
    !server.approved_maintenance.includes(action) &&
    !server.approved_maintenance.includes("maintenance.run")
  ) {
    throw new Error(`Action not in server approved_maintenance: ${action}`);
  }

  const buildTimeoutMs = action.endsWith(".build")
    ? Math.max(timeoutMs(policy), 15 * 60_000)
    : timeoutMs(policy);

  return withMaintenanceLock(policy, server, action, async () => {
    const transport = getServerTransport(server);
    const before = await transport.exec(server, ["uptime"], {
      timeoutMs: timeoutMs(policy),
    });
    const r = await transport.exec(server, factory(server), {
      timeoutMs: buildTimeoutMs,
    });
    const after = await transport.exec(server, ["uptime"], {
      timeoutMs: timeoutMs(policy),
    });
    return {
      serverId: server.id,
      environment: server.environment,
      action,
      before: sanitizeOut(before.stdout.trim(), 500),
      exitCode: r.code,
      detail: sanitizeOut((r.stdout || r.stderr).trim(), 4000),
      after: sanitizeOut(after.stdout.trim(), 500),
    };
  });
}

export function approvalCreate(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>
) {
  requireServerOpsEnabled(policy);
  const server = getAccessibleServer(
    policy,
    principal,
    String(args.serverId || "")
  );
  if (String(args.confirmEnvironment || "") !== server.environment) {
    throw new Error("confirmEnvironment must match server environment");
  }
  requireOperatorTokenConfigured();
  const a = createServerApproval({
    principalId: principal.id,
    serverId: server.id,
    environment: server.environment,
    actions: Array.isArray(args.actions)
      ? (args.actions.map(String) as ServerMaintenanceAction[])
      : undefined,
    summary: args.summary ? String(args.summary) : undefined,
    ttlMs: args.ttlMs ? Number(args.ttlMs) : undefined,
    uses: args.uses ? Number(args.uses) : undefined,
  });
  return {
    approvalId: a.id,
    serverId: a.serverId,
    environment: a.environment,
    actions: a.actions,
    status: a.status,
    expiresAt: new Date(a.expiresAt).toISOString(),
    usesLeft: a.usesLeft,
    next:
      a.status === "pending"
        ? pendingApprovalNext(a.id)
        : "Dev self-approve enabled — ready to use.",
  };
}
