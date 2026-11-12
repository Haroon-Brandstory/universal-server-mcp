import { spawn } from "node:child_process";

/** Curated argv runner — no shell. */
export function runArgv(
  argv: string[],
  opts: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv }
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (!argv.length) throw new Error("Empty argv");
  for (const a of argv) {
    if (/[\0\n\r;|&`$<>]/.test(a)) {
      throw new Error("Unsafe character in scanner argv");
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, PATH: process.env.PATH },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const max = 512_000;
    const append = (which: "out" | "err", buf: Buffer) => {
      const s = buf.toString("utf8");
      if (which === "out") stdout += s;
      else stderr += s;
      if (Buffer.byteLength(stdout + stderr) > max) child.kill("SIGKILL");
    };
    child.stdout?.on("data", (b) => append("out", b));
    child.stderr?.on("data", (b) => append("err", b));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Scanner timeout after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function commandExists(bin: string): Promise<boolean> {
  try {
    const r = await runArgv(["which", bin], { timeoutMs: 3000 });
    return r.code === 0 && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
