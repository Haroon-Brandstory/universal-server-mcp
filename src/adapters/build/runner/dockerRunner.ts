import { spawn } from "node:child_process";
import type { BuildJobResult, BuildJobSpec, BuildRunner } from "../types.js";

/**
 * Non-privileged Docker runner.
 * - no docker.sock mount
 * - no host credential mounts
 * - --network none by default
 * - read-only rootfs + tmpfs /tmp
 * - drop caps, no new privileges
 */
export class DockerBuildRunner implements BuildRunner {
  readonly kind = "docker" as const;

  async run(spec: BuildJobSpec, signal: AbortSignal): Promise<BuildJobResult> {
    const started = Date.now();
    const networkArgs =
      spec.network === "none" || !spec.task.networkRequired
        ? ["--network", "none"]
        : ["--network", "bridge"]; // allowlist enforcement is policy-level; docker userland proxy still restricted by no privileged

    // When allowlist mode is requested, still refuse arbitrary egress claims —
    // without a custom network plugin we only allow "none" or documented bridge.
    if (spec.network === "allowlist" && spec.task.networkRequired) {
      if (!spec.networkAllowlist.length) {
        throw new Error("network allowlist empty");
      }
    }

    const dockerArgs = [
      "run",
      "--rm",
      "--name",
      `mcp-build-${spec.jobId.slice(0, 12)}`,
      ...networkArgs,
      "--user",
      "65534:65534",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--memory",
      `${spec.memoryMb}m`,
      "--cpus",
      spec.cpu,
      "--pids-limit",
      "256",
      "--security-opt",
      "no-new-privileges",
      "--cap-drop",
      "ALL",
      "-w",
      "/workspace",
      "-v",
      `${spec.workspaceDir}:/workspace:rw`,
      spec.task.image,
      ...spec.task.argv,
    ];

    return await new Promise<BuildJobResult>((resolve) => {
      const child = spawn("docker", dockerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: { PATH: process.env.PATH },
      });

      let log = "";
      const append = (buf: Buffer) => {
        log += buf.toString("utf8");
        if (Buffer.byteLength(log, "utf8") > spec.maxLogBytes) {
          log = log.slice(0, spec.maxLogBytes) + "\n…[log truncated]\n";
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);

      let timedOut = false;
      let cancelled = false;
      const timer = setTimeout(() => {
        timedOut = true;
        spawn("docker", ["kill", `mcp-build-${spec.jobId.slice(0, 12)}`], {
          stdio: "ignore",
          shell: false,
        });
        child.kill("SIGKILL");
      }, spec.timeoutSec * 1000);

      const onAbort = () => {
        cancelled = true;
        spawn("docker", ["kill", `mcp-build-${spec.jobId.slice(0, 12)}`], {
          stdio: "ignore",
          shell: false,
        });
        child.kill("SIGKILL");
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });

      child.on("error", (err) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve({
          exitCode: null,
          timedOut,
          cancelled,
          logText: log + `\nERROR: ${err.message}`,
          durationMs: Date.now() - started,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve({
          exitCode: code,
          timedOut,
          cancelled,
          logText: log,
          durationMs: Date.now() - started,
        });
      });
    });
  }
}
