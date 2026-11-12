/** Retry only for safe/idempotent read operations. */

const SAFE_RETRY_TOOLS = new Set([
  "http.request",
  "page.snapshot",
  "code.list",
  "code.read",
  "code.search",
  "git.repo.list",
  "git.repo.info",
  "git.branch.list",
  "git.file.read",
  "git.diff",
  "git.pr.status",
  "git.ci.status",
  "build.status",
  "build.logs",
  "server.list",
  "server.health",
  "server.metrics",
  "db.connections",
  "db.health",
  "db.schemas",
  "db.tables",
  "security.findings",
  "deploy.projects",
  "deploy.history",
  "deploy.status",
  "platform.info",
  "platform.projects",
  "platform.metrics",
  "policy.explain",
]);

export function isRetrySafeTool(tool: string): boolean {
  return SAFE_RETRY_TOOLS.has(tool);
}

export async function withRetry<T>(
  tool: string,
  fn: () => Promise<T>,
  opts?: { retries?: number; baseMs?: number }
): Promise<T> {
  const retries = isRetrySafeTool(tool) ? opts?.retries ?? 2 : 0;
  const baseMs = opts?.baseMs ?? 50;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Do not retry auth/policy denials
      if (/DENY|not authorized|Authentication failed|write=false/i.test(msg)) {
        throw err;
      }
      if (i === retries) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}
