import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { ExecResult, ServerRecord, ServerTransport } from "./types.js";

function resolveKeyPath(server: ServerRecord): string {
  const envName = server.connection.private_key_path_env;
  if (!envName) throw new Error(`Server ${server.id}: private_key_path_env required`);
  const path = process.env[envName];
  if (!path) throw new Error(`Server ${server.id}: env ${envName} not set`);
  if (!existsSync(path)) throw new Error(`Server ${server.id}: key file missing`);
  // Never return key material — only validate readable
  readFileSync(path, { flag: "r" });
  return path;
}

function resolveKnownHosts(server: ServerRecord): string {
  const envName = server.connection.known_hosts_path_env;
  if (!envName) {
    throw new Error(`Server ${server.id}: known_hosts_path_env required (host key verification)`);
  }
  const path = process.env[envName];
  if (!path || !existsSync(path)) {
    throw new Error(`Server ${server.id}: known_hosts file missing (${envName})`);
  }
  return path;
}

/** Reject empty / shell metacharacters in argv tokens. */
export function assertSafeArgv(argv: string[]): string[] {
  if (!argv.length) throw new Error("Empty remote argv");
  for (const a of argv) {
    if (typeof a !== "string" || !a.length) throw new Error("Invalid argv token");
    if (/[\0\n\r;|&`$<>]/.test(a)) {
      throw new Error("Unsafe character in curated argv");
    }
  }
  return argv;
}

/**
 * OpenSSH transport — BatchMode (keys only), strict host key checking.
 * Does not install agents or rewrite remote SSH config.
 */
export class SshServerTransport implements ServerTransport {
  async exec(
    server: ServerRecord,
    argv: string[],
    opts: { timeoutMs: number }
  ): Promise<ExecResult> {
    if (server.connection.method !== "ssh") {
      throw new Error(`Server ${server.id} connection.method is not ssh`);
    }
    if (server.connection.user === "root") {
      throw new Error("Root SSH user forbidden for ServerOps");
    }
    const safe = assertSafeArgv(argv);
    const keyPath = resolveKeyPath(server);
    const knownHosts = resolveKnownHosts(server);
    const port = String(server.connection.port || 22);
    const target = `${server.connection.user}@${server.connection.host}`;

    const sshArgv = [
      "-i",
      keyPath,
      "-p",
      port,
      "-o",
      "BatchMode=yes",
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "PasswordAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=no",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${knownHosts}`,
      "-o",
      "ConnectTimeout=10",
      target,
      "--",
      ...safe,
    ];

    const started = Date.now();
    return await new Promise<ExecResult>((resolve, reject) => {
      const child = spawn("ssh", sshArgv, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: { PATH: process.env.PATH },
      });
      let stdout = "";
      let stderr = "";
      const max = 256_000;
      const append = (which: "out" | "err", buf: Buffer) => {
        const s = buf.toString("utf8");
        if (which === "out") stdout += s;
        else stderr += s;
        if (Buffer.byteLength(stdout + stderr) > max) {
          child.kill("SIGKILL");
        }
      };
      child.stdout?.on("data", (b) => append("out", b));
      child.stderr?.on("data", (b) => append("err", b));

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`SSH exec timeout after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`SSH failed: ${err.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          code: code ?? 1,
          stdout,
          stderr: redactTransportStderr(stderr),
          durationMs: Date.now() - started,
        });
      });
    });
  }
}

function redactTransportStderr(s: string): string {
  return s
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----/g, "[REDACTED_KEY]")
    .replace(/ssh-rsa\s+\S+/g, "ssh-rsa [REDACTED]");
}

export type MockExecHandler = (
  server: ServerRecord,
  argv: string[]
) => Promise<ExecResult> | ExecResult;

export class MockServerTransport implements ServerTransport {
  constructor(private readonly handler: MockExecHandler) {}
  async exec(
    server: ServerRecord,
    argv: string[],
    _opts: { timeoutMs: number }
  ): Promise<ExecResult> {
    assertSafeArgv(argv);
    const started = Date.now();
    const r = await this.handler(server, argv);
    return { ...r, durationMs: r.durationMs || Date.now() - started };
  }
}

/**
 * Run curated argv on the gateway host (no SSH).
 * For local FE/BE smoke while Next/Strapi run on the same machine as MCP.
 * Not usable from Render → your laptop localhost.
 */
export class LocalServerTransport implements ServerTransport {
  async exec(
    server: ServerRecord,
    argv: string[],
    opts: { timeoutMs: number }
  ): Promise<ExecResult> {
    if (server.connection.method !== "local") {
      throw new Error(`Server ${server.id} connection.method is not local`);
    }
    const safe = assertSafeArgv(argv);
    const started = Date.now();
    return await new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(safe[0]!, safe.slice(1), {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      let stdout = "";
      let stderr = "";
      const max = 256_000;
      const append = (which: "out" | "err", buf: Buffer) => {
        const s = buf.toString("utf8");
        if (which === "out") stdout += s;
        else stderr += s;
        if (Buffer.byteLength(stdout + stderr) > max) {
          child.kill("SIGKILL");
        }
      };
      child.stdout?.on("data", (b) => append("out", b));
      child.stderr?.on("data", (b) => append("err", b));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`local exec timeout after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
      child.on("error", (err) => {
        clearTimeout(timer);
        // Missing binary (e.g. /proc tools on macOS) → soft fail, not crash.
        resolve({
          code: 127,
          stdout: "",
          stderr: redactTransportStderr(err.message),
          durationMs: Date.now() - started,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          code: code ?? 1,
          stdout,
          stderr: redactTransportStderr(stderr),
          durationMs: Date.now() - started,
        });
      });
    });
  }
}

let override: ServerTransport | null = null;

export function setServerTransportForTests(t: ServerTransport | null): void {
  override = t;
}

export function getServerTransport(server: ServerRecord): ServerTransport {
  if (override) return override;
  if (server.connection.method === "mock") {
    throw new Error(
      `Server ${server.id} is mock-only; inject MockServerTransport in tests`
    );
  }
  if (server.connection.method === "local") {
    return new LocalServerTransport();
  }
  return new SshServerTransport();
}
