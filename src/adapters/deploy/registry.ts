import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument, Principal } from "../../types.js";
import type {
  DeployEnvironmentConfig,
  DeployProjectRecord,
  DeploymentsDocument,
} from "./types.js";

export function deploymentsPath(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.deployops?.deployments_path ||
      process.env.MCP_DEPLOYMENTS_PATH ||
      "./config/deployments.yaml"
  );
}

export function loadDeploymentsDocument(
  policy: PolicyDocument
): DeploymentsDocument {
  const path = deploymentsPath(policy);
  if (!existsSync(path)) return { version: 1, projects: [] };
  const doc = parseYaml(readFileSync(path, "utf8")) as DeploymentsDocument;
  if (!doc?.projects || !Array.isArray(doc.projects)) {
    throw new Error(`Invalid deployments registry at ${path}`);
  }
  return doc;
}

export function listAccessibleDeployProjects(
  policy: PolicyDocument,
  principal: Principal
): DeployProjectRecord[] {
  const projects = new Set(principal.projects || []);
  return loadDeploymentsDocument(policy).projects.filter((p) => {
    if (p.enabled === false) return false;
    return projects.has(p.project_id);
  });
}

export function getAccessibleDeployProject(
  policy: PolicyDocument,
  principal: Principal,
  deployProjectId: string
): DeployProjectRecord {
  const p = listAccessibleDeployProjects(policy, principal).find(
    (x) => x.id === deployProjectId || x.project_id === deployProjectId
  );
  if (!p) {
    throw new Error(
      `Deploy project not found or not authorized: ${deployProjectId}`
    );
  }
  return p;
}

export function getEnvironment(
  project: DeployProjectRecord,
  environment: string
): DeployEnvironmentConfig {
  const env = project.environments.find(
    (e) => e.name === environment && e.enabled !== false
  );
  if (!env) {
    throw new Error(
      `Environment not configured on deploy project ${project.id}: ${environment}`
    );
  }
  return env;
}

export function publicDeployProjectView(p: DeployProjectRecord) {
  return {
    id: p.id,
    projectId: p.project_id,
    label: p.label || p.id,
    environments: p.environments
      .filter((e) => e.enabled !== false)
      .map((e) => ({
        name: e.name,
        provider: e.provider,
        profile: e.profile,
        workflow: e.workflow || null,
        serverId: e.server_id || null,
        actionId: e.action_id || null,
        healthCheckCount: e.health_checks?.length || 0,
        requiresDbCompat: Boolean(e.requires_db_compat),
      })),
    knownGoodShaCount: p.known_good_shas?.length || 0,
  };
}
