import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeArgv,
  LocalServerTransport,
  SshServerTransport,
} from "./transport.js";
import type { ServerRecord } from "./types.js";

describe("SshServerTransport guards", () => {
  it("forbids root user before spawn", async () => {
    const server: ServerRecord = {
      id: "x",
      project_id: "app",
      environment: "development",
      connection: {
        method: "ssh",
        host: "example.test",
        user: "root",
        private_key_path_env: "MISSING_KEY",
        known_hosts_path_env: "MISSING_HOSTS",
      },
      services: [],
      approved_maintenance: [],
    };
    const t = new SshServerTransport();
    await assert.rejects(
      () => t.exec(server, ["uptime"], { timeoutMs: 1000 }),
      /Root SSH user forbidden/
    );
  });

  it("rejects unsafe argv before ssh", () => {
    assert.throws(() => assertSafeArgv(["sh", "-c", "id && whoami"]));
  });
});

describe("LocalServerTransport", () => {
  it("runs curated local argv", async () => {
    const server: ServerRecord = {
      id: "local-x",
      project_id: "app",
      environment: "development",
      connection: {
        method: "local",
        host: "127.0.0.1",
        user: "local",
      },
      services: [],
      approved_maintenance: [],
    };
    const t = new LocalServerTransport();
    const r = await t.exec(server, ["uname"], { timeoutMs: 5000 });
    assert.equal(r.code, 0);
    assert.ok(r.stdout.trim().length > 0);
  });
});
