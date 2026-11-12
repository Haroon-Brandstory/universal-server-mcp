import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditEvent } from "../types.js";
import { auditPath } from "../config.js";
import { redactUrl } from "../security/redact.js";

function sanitizeEvent(event: AuditEvent): AuditEvent {
  const out: AuditEvent = { ...event };
  if (out.target) {
    out.target = redactUrl(out.target);
  }
  if (out.reason) {
    out.reason = out.reason.replace(
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      "Bearer [REDACTED]"
    );
  }
  return out;
}

export function writeAudit(event: AuditEvent): void {
  const path = auditPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(sanitizeEvent(event)) + "\n", "utf8");
}

export function tailAudit(limit = 50): AuditEvent[] {
  const path = auditPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l) as AuditEvent);
}
