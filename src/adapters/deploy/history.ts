import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PolicyDocument } from "../../types.js";
import type { DeployRecord, DeployStatus } from "./types.js";

function historyPath(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.deployops?.history_path ||
      process.env.MCP_DEPLOY_HISTORY_PATH ||
      "./data/deploy-history.json"
  );
}

function load(policy: PolicyDocument): DeployRecord[] {
  const path = historyPath(policy);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as DeployRecord[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(policy: PolicyDocument, rows: DeployRecord[]): void {
  const path = historyPath(policy);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2), "utf8");
}

export function appendDeploy(
  policy: PolicyDocument,
  partial: Omit<DeployRecord, "id" | "createdAt" | "updatedAt">
): DeployRecord {
  const now = new Date().toISOString();
  const rec: DeployRecord = {
    ...partial,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const all = load(policy);
  all.push(rec);
  save(policy, all.slice(-2000));
  return rec;
}

export function updateDeploy(
  policy: PolicyDocument,
  id: string,
  patch: Partial<DeployRecord>
): DeployRecord {
  const all = load(policy);
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Deploy record not found: ${id}`);
  all[idx] = {
    ...all[idx],
    ...patch,
    id: all[idx].id,
    updatedAt: new Date().toISOString(),
  };
  save(policy, all);
  return all[idx];
}

export function listHistory(
  policy: PolicyDocument,
  filter: {
    projectIds: Set<string>;
    projectId?: string;
    environment?: string;
    limit?: number;
  }
): DeployRecord[] {
  let rows = load(policy).filter((r) => filter.projectIds.has(r.projectId));
  if (filter.projectId) {
    rows = rows.filter((r) => r.projectId === filter.projectId);
  }
  if (filter.environment) {
    rows = rows.filter((r) => r.environment === filter.environment);
  }
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(filter.limit || 50, 200));
}

export function getDeploy(
  policy: PolicyDocument,
  projectIds: Set<string>,
  deployId: string
): DeployRecord {
  const rec = load(policy).find(
    (r) => r.id === deployId && projectIds.has(r.projectId)
  );
  if (!rec) throw new Error(`Deploy not found or not authorized: ${deployId}`);
  return rec;
}

export function latestHealthy(
  policy: PolicyDocument,
  projectId: string,
  environment: string
): DeployRecord | undefined {
  return load(policy)
    .filter(
      (r) =>
        r.projectId === projectId &&
        r.environment === environment &&
        (r.status === "healthy" || r.status === "running") &&
        r.kind === "deploy"
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function resetDeployHistoryForTests(policy: PolicyDocument): void {
  save(policy, []);
}

export type { DeployStatus };
