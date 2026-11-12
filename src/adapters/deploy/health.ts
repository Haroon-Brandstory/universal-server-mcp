import type { DeployHealthCheck } from "./types.js";

export async function runHealthChecks(
  checks: DeployHealthCheck[] | undefined,
  timeoutMs: number
): Promise<{ ok: boolean; detail: string; results: Array<{ url: string; ok: boolean; status?: number }> }> {
  if (!checks?.length) {
    return { ok: true, detail: "no health checks configured", results: [] };
  }
  const results: Array<{ url: string; ok: boolean; status?: number }> = [];
  for (const c of checks) {
    let u: URL;
    try {
      u = new URL(c.url);
    } catch {
      results.push({ url: c.url, ok: false });
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      results.push({ url: c.url, ok: false });
      continue;
    }
    try {
      const res = await fetch(c.url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const expect = c.expect_status ?? 200;
      results.push({
        url: c.url,
        ok: res.status === expect,
        status: res.status,
      });
    } catch {
      results.push({ url: c.url, ok: false });
    }
  }
  const ok = results.every((r) => r.ok);
  return {
    ok,
    detail: results
      .map((r) => `${r.url}=>${r.ok ? "ok" : "fail"}${r.status ? `(${r.status})` : ""}`)
      .join("; "),
    results,
  };
}

/** Test helper — injectable fetch not required; mock mode skips network. */
export async function mockHealthOk(
  checks: DeployHealthCheck[] | undefined
): Promise<{ ok: boolean; detail: string }> {
  return {
    ok: true,
    detail: `mock health ok for ${checks?.length || 0} checks`,
  };
}
