import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument } from "./types.js";
import { mergeProjectsIntoPolicy } from "./platform/projectRegistry.js";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

export function policyPath(): string {
  return resolve(process.cwd(), process.env.MCP_POLICY_PATH || "./config/policy.yaml");
}

export function auditPath(): string {
  return resolve(process.cwd(), process.env.MCP_AUDIT_PATH || "./logs/audit.jsonl");
}

export function loadPolicy(): PolicyDocument {
  const path = policyPath();
  const raw = readFileSync(path, "utf8");
  let doc = parseYaml(raw) as PolicyDocument;
  if (!doc?.principals?.length) {
    throw new Error(`Invalid policy at ${path}: no principals`);
  }
  if (process.env.MCP_KILL_SWITCH === "1") {
    doc.kill_switch = true;
  }
  if (process.env.MCP_RATE_LIMIT_PER_MIN) {
    doc.rate_limit_per_min = Number(process.env.MCP_RATE_LIMIT_PER_MIN);
  }
  // Universal project registry merge (config-driven; no gateway core edits)
  doc = mergeProjectsIntoPolicy(doc);
  return doc;
}
