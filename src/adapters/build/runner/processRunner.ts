import { spawn } from "node:child_process";
import type { BuildJobResult, BuildJobSpec, BuildRunner } from "../types.js";

/**
 * Local process sandbox for curated argv only.
 * Used in tests / explicit policy.allow_process_runner.
 * Still: no shell, scrubbed env, timeout, cwd = job workspace.
 */
export class ProcessBuildRunner implements BuildRunner {
  readonly kind = "process" as const;

  async run(spec: BuildJobSpec, signal: AbortSignal): Promise<BuildJobResult> {
    const started = Date.now();
    const [cmd, ...args] = spec.task.argv;
    if (!cmd) throw new Error("Empty curated argv");

    // Block obvious host escapes in argv
    for (const a of spec.task.argv) {
      if (a.includes("\0")) throw new Error("Invalid argv");
    }

    if (spec.network !== "none" && spec.task.networkRequired) {
      // process runner cannot enforce network allowlist — require docker for network
      throw new Error(
        "Process runner cannot enforce network policy; use docker runner for network tasks"
      );
    }

    return await new Promise<BuildJobResult>((resolve) => {
      const child = spawn(cmd, args, {
        cwd: spec.workspaceDir,
        env: {
          PATH: process.env.PATH,
          HOME: spec.workspaceDir,
          LANG: "C.UTF-8",
          NODE_ENV: "test",
          CI: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });

      let log = "";
      const append = (buf: Buffer) => {
        log += buf.toString("utf8");
        if (Buffer.byteLength(log, "utf8") > spec.maxLogBytes) {
          log =
            log.slice(0, spec.maxLogBytes) +
            "\n…[log truncated]\n";
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
        child.kill("SIGKILL");
      }, spec.timeoutSec * 1000);

      const onAbort = () => {
        cancelled = true;
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
