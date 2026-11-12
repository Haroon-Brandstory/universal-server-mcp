import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type MetricCounters = {
  toolCalls: number;
  toolAllow: number;
  toolDeny: number;
  toolErrors: number;
  byTool: Record<string, { allow: number; deny: number; msTotal: number }>;
};

const counters: MetricCounters = {
  toolCalls: 0,
  toolAllow: 0,
  toolDeny: 0,
  toolErrors: 0,
  byTool: {},
};

function metricsLogPath(): string {
  return resolve(
    process.cwd(),
    process.env.MCP_METRICS_PATH || "./logs/metrics.jsonl"
  );
}

export function newTraceId(): string {
  return randomUUID();
}

export function recordToolMetric(input: {
  tool: string;
  decision: "allow" | "deny";
  durationMs: number;
  principalId: string;
  sessionId: string;
  traceId: string;
  error?: boolean;
}): void {
  counters.toolCalls += 1;
  if (input.decision === "allow") counters.toolAllow += 1;
  else counters.toolDeny += 1;
  if (input.error) counters.toolErrors += 1;

  const slot = counters.byTool[input.tool] || {
    allow: 0,
    deny: 0,
    msTotal: 0,
  };
  if (input.decision === "allow") slot.allow += 1;
  else slot.deny += 1;
  slot.msTotal += input.durationMs;
  counters.byTool[input.tool] = slot;

  if (process.env.MCP_METRICS_ENABLED === "0") return;
  try {
    const path = metricsLogPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(
      path,
      JSON.stringify({
        ts: new Date().toISOString(),
        type: "tool",
        ...input,
      }) + "\n"
    );
  } catch {
    /* never break gateway on metrics I/O */
  }
}

export function getMetricsSnapshot(): MetricCounters & { uptimeSec: number } {
  return {
    ...counters,
    byTool: { ...counters.byTool },
    uptimeSec: Math.floor(process.uptime()),
  };
}

export function resetMetricsForTests(): void {
  counters.toolCalls = 0;
  counters.toolAllow = 0;
  counters.toolDeny = 0;
  counters.toolErrors = 0;
  counters.byTool = {};
}

/** Structured log line (stdout JSON) — operators scrape / ship to SIEM. */
export function structuredLog(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}
