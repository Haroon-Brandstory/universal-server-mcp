import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PolicyDocument, PolicyEnvironment } from "../../types.js";
import type {
  FindingVerification,
  ScanKind,
  SecurityFinding,
} from "./types.js";

function storePath(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.securityops?.findings_path ||
      process.env.MCP_SECURITY_FINDINGS_PATH ||
      "./data/security-findings.json"
  );
}

function loadAll(policy: PolicyDocument): SecurityFinding[] {
  const path = storePath(policy);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as SecurityFinding[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveAll(policy: PolicyDocument, findings: SecurityFinding[]): void {
  const path = storePath(policy);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(findings, null, 2), "utf8");
}

export function persistFindings(
  policy: PolicyDocument,
  input: {
    projectId: string;
    environment: PolicyEnvironment;
    scanKind: ScanKind;
    items: Array<
      Omit<
        SecurityFinding,
        "id" | "projectId" | "environment" | "createdAt" | "verification"
      >
    >;
  }
): SecurityFinding[] {
  const max = policy.securityops?.max_findings_per_scan || 200;
  const now = new Date().toISOString();
  const created: SecurityFinding[] = input.items.slice(0, max).map((f) => ({
    ...f,
    id: randomUUID(),
    projectId: input.projectId,
    environment: input.environment,
    scanKind: input.scanKind,
    createdAt: now,
    verification: "unverified" as FindingVerification,
  }));
  const all = loadAll(policy);
  // Drop prior unverified findings for same project+scanKind to avoid unbounded growth
  const kept = all.filter(
    (x) =>
      !(
        x.projectId === input.projectId &&
        x.scanKind === input.scanKind &&
        x.verification === "unverified"
      )
  );
  const next = [...kept, ...created].slice(-2000);
  saveAll(policy, next);
  return created;
}

export function listFindings(
  policy: PolicyDocument,
  filter: {
    projectIds: Set<string>;
    projectId?: string;
    severity?: string;
    verification?: string;
    findingId?: string;
    limit?: number;
  }
): SecurityFinding[] {
  let rows = loadAll(policy).filter((f) => filter.projectIds.has(f.projectId));
  if (filter.findingId) {
    rows = rows.filter((f) => f.id === filter.findingId);
  }
  if (filter.projectId) {
    rows = rows.filter((f) => f.projectId === filter.projectId);
  }
  if (filter.severity) {
    rows = rows.filter((f) => f.severity === filter.severity);
  }
  if (filter.verification) {
    rows = rows.filter((f) => f.verification === filter.verification);
  }
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(filter.limit || 100, 500));
}

export function getFinding(
  policy: PolicyDocument,
  projectIds: Set<string>,
  findingId: string
): SecurityFinding {
  const f = listFindings(policy, { projectIds, findingId, limit: 1 })[0];
  if (!f) throw new Error(`Finding not found or not authorized: ${findingId}`);
  return f;
}

export function updateFindingVerification(
  policy: PolicyDocument,
  projectIds: Set<string>,
  findingId: string,
  verification: FindingVerification
): SecurityFinding {
  const all = loadAll(policy);
  const idx = all.findIndex(
    (f) => f.id === findingId && projectIds.has(f.projectId)
  );
  if (idx < 0) throw new Error(`Finding not found or not authorized: ${findingId}`);
  all[idx] = { ...all[idx], verification };
  saveAll(policy, all);
  return all[idx];
}

export function resetFindingsStoreForTests(policy: PolicyDocument): void {
  saveAll(policy, []);
}
