import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument, Principal } from "../../types.js";
import type { SecurityTarget, SecurityTargetsDocument } from "./types.js";

export function targetsPath(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.securityops?.targets_path ||
      process.env.MCP_SECURITY_TARGETS_PATH ||
      "./config/security.yaml"
  );
}

export function loadTargetsDocument(
  policy: PolicyDocument
): SecurityTargetsDocument {
  const path = targetsPath(policy);
  if (!existsSync(path)) return { version: 1, targets: [] };
  const doc = parseYaml(readFileSync(path, "utf8")) as SecurityTargetsDocument;
  if (!doc?.targets || !Array.isArray(doc.targets)) {
    throw new Error(`Invalid security targets registry at ${path}`);
  }
  return doc;
}

export function listAccessibleTargets(
  policy: PolicyDocument,
  principal: Principal
): SecurityTarget[] {
  const projects = new Set(principal.projects || []);
  return loadTargetsDocument(policy).targets.filter((t) => {
    if (t.enabled === false) return false;
    return projects.has(t.project_id);
  });
}

export function getAccessibleTarget(
  policy: PolicyDocument,
  principal: Principal,
  targetId: string
): SecurityTarget {
  const t = listAccessibleTargets(policy, principal).find(
    (x) => x.id === targetId
  );
  if (!t) {
    throw new Error(`Security target not found or not authorized: ${targetId}`);
  }
  return t;
}

export function publicTargetView(t: SecurityTarget) {
  return {
    id: t.id,
    label: t.label || t.id,
    projectId: t.project_id,
    environment: t.environment,
    allowedScans: t.allowed_scans,
    httpOriginCount: t.http_origins?.length || 0,
    serverId: t.server_id || null,
    frameworks: t.frameworks || [],
    containerImageCount: t.container_images?.length || 0,
  };
}
