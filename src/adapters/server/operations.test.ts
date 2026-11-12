import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { PolicyDocument, Principal } from "../../types.js";
import {
  approvalCreate,
  cacheClear,
  health,
  listServers,
  maintenanceRun,
  metrics,
  serviceRestart,
  services,
} from "./operations.js";
import {
  MockServerTransport,
  assertSafeArgv,
  setServerTransportForTests,
} from "./transport.js";
import { resetServerApprovalsForTests } from "./approval.js";
import { resetServerControlsForTests } from "./controls.js";

const fixturesServers = resolve(
  process.cwd(),
  "fixtures/serverops/servers.yaml"
);

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
  serverops: {
    enabled: true,
    servers_path: fixturesServers,
    require_maintenance_approval: true,
    maintenance_rate_limit_per_min: 20,
    default_timeout_sec: 5,
    max_log_bytes: 8000,
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

afterEach(() => {
  setServerTransportForTests(null);
  resetServerApprovalsForTests();
  resetServerControlsForTests();
});

function installMock(): void {
  setServerTransportForTests(
    new MockServerTransport((_server, argv) => {
      const cmd = argv.join(" ");
      if (cmd.startsWith("uptime")) {
        return { code: 0, stdout: "up 1 day", stderr: "", durationMs: 1 };
      }
      if (cmd.includes("/proc/loadavg")) {
        return { code: 0, stdout: "0.10 0.20 0.30", stderr: "", durationMs: 1 };
      }
      if (cmd.startsWith("free") || cmd.startsWith("df") || cmd.includes("/proc/stat")) {
        return { code: 0, stdout: "ok-metrics", stderr: "", durationMs: 1 };
      }
      if (cmd.includes("systemctl is-active nginx") || cmd === "systemctl is-active nginx") {
        return { code: 0, stdout: "active", stderr: "", durationMs: 1 };
      }
      if (cmd.startsWith("pm2")) {
        return { code: 0, stdout: '[{"name":"nextjs"}]', stderr: "", durationMs: 1 };
      }
      if (cmd.startsWith("curl")) {
        return { code: 0, stdout: "200", stderr: "", durationMs: 1 };
      }
      if (cmd.includes("systemctl restart") || cmd.includes("nginx -s reload")) {
        return { code: 0, stdout: "", stderr: "", durationMs: 1 };
      }
      if (cmd.startsWith("openssl")) {
        return { code: 0, stdout: "CONNECTION ESTABLISHED", stderr: "", durationMs: 1 };
      }
      return {
        code: 0,
        stdout: `mock:${cmd}`,
        stderr: "",
        durationMs: 1,
      };
    })
  );
}

describe("assertSafeArgv", () => {
  it("rejects shell metacharacters", () => {
    assert.throws(() => assertSafeArgv(["echo", "a;b"]));
    assert.throws(() => assertSafeArgv(["bash", "-c", "x|y"]));
  });
});

describe("server registry access", () => {
  it("lists only principal project servers", () => {
    const out = listServers(policy, principal({ id: "op" }));
    const ids = out.servers.map((s) => s.id).sort();
    assert.deepEqual(ids, ["mock-be", "mock-fe"]);
    assert.ok(!JSON.stringify(out).includes("private_key"));
  });

  it("denies other project servers", () => {
    const out = listServers(
      policy,
      principal({ id: "op", projects: ["missing"] })
    );
    assert.equal(out.servers.length, 0);
  });
});

describe("read-only probes (mock VPS)", () => {
  it("returns health + metrics", async () => {
    installMock();
    const p = principal({ id: "op" });
    const h = await health(policy, p, { serverId: "mock-fe" });
    assert.equal(h.serverId, "mock-fe");
    assert.ok(h.uptime.includes("up"));
    assert.equal((h.services.nginx as { ok: boolean }).ok, true);
    assert.equal(h.appHealth[0]?.ok, true);

    const m = await metrics(policy, p, { serverId: "mock-fe" });
    assert.ok(m.memory.includes("ok-metrics"));

    const svc = await services(policy, p, { serverId: "mock-fe" });
    assert.equal((svc.services.nginx as { active: boolean }).active, true);
  });
});

describe("maintenance controls", () => {
  it("requires approval + confirms for restart", async () => {
    installMock();
    const p = principal({ id: "op", write: true, admin: true });
    await assert.rejects(
      () =>
        serviceRestart(policy, p, {
          serverId: "mock-fe",
          service: "nginx",
          confirmServerId: "mock-fe",
          confirmEnvironment: "development",
        }),
      /approvalId/
    );

    const a = approvalCreate(p, policy, {
      serverId: "mock-fe",
      confirmEnvironment: "development",
      actions: ["service.restart"],
      uses: 2,
    });

    const r = await serviceRestart(policy, p, {
      serverId: "mock-fe",
      service: "nginx",
      approvalId: a.approvalId,
      confirmServerId: "mock-fe",
      confirmEnvironment: "development",
    });
    assert.equal(r.restartExit, 0);
    assert.ok(r.before);
    assert.ok(r.after);
  });

  it("rejects unsupported service restart", async () => {
    installMock();
    const p = principal({ id: "op", write: true, admin: true });
    const a = approvalCreate(p, policy, {
      serverId: "mock-fe",
      confirmEnvironment: "development",
    });
    await assert.rejects(
      () =>
        serviceRestart(policy, p, {
          serverId: "mock-fe",
          service: "postgres",
          approvalId: a.approvalId,
          confirmServerId: "mock-fe",
          confirmEnvironment: "development",
        }),
      /not enabled|Unsupported/
    );
  });

  it("runs constrained maintenance action only", async () => {
    installMock();
    const p = principal({ id: "op", write: true, admin: true });
    const a = approvalCreate(p, policy, {
      serverId: "mock-fe",
      confirmEnvironment: "development",
      actions: ["maintenance.run"],
    });
    const out = await maintenanceRun(policy, p, {
      serverId: "mock-fe",
      action: "disk.inode.check",
      approvalId: a.approvalId,
      confirmServerId: "mock-fe",
      confirmEnvironment: "development",
    });
    assert.equal(out.action, "disk.inode.check");
    assert.equal(out.exitCode, 0);

    await assert.rejects(
      () =>
        maintenanceRun(policy, p, {
          serverId: "mock-fe",
          action: "rm -rf /",
          approvalId: a.approvalId,
          confirmServerId: "mock-fe",
          confirmEnvironment: "development",
        }),
      /Unsupported maintenance/
    );
  });

  it("cache clear needs approval and allowlisted profile", async () => {
    installMock();
    const p = principal({ id: "op", write: true, admin: true });
    const a = approvalCreate(p, policy, {
      serverId: "mock-fe",
      confirmEnvironment: "development",
      actions: ["cache.clear"],
    });
    const out = await cacheClear(policy, p, {
      serverId: "mock-fe",
      service: "nginx",
      approvalId: a.approvalId,
      confirmServerId: "mock-fe",
      confirmEnvironment: "development",
    });
    assert.equal(out.ok, true);
  });

  it("blocks write=false maintenance", async () => {
    installMock();
    const p = principal({ id: "ro", write: false });
    await assert.rejects(
      () =>
        serviceRestart(policy, p, {
          serverId: "mock-fe",
          service: "nginx",
          approvalId: "x",
          confirmServerId: "mock-fe",
          confirmEnvironment: "development",
        }),
      /write=false/
    );
  });
});
