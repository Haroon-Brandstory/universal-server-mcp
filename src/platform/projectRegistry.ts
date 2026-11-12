import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument, ProjectScope } from "../types.js";

export interface ProjectsDocument {
  version: number;
  projects: ProjectScope[];
}

export function projectsRegistryPath(policy?: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy?.platform?.projects_path ||
      process.env.MCP_PROJECTS_PATH ||
      "./config/projects.yaml"
  );
}

export function loadProjectsDocument(
  policy?: PolicyDocument
): ProjectsDocument {
  const path = projectsRegistryPath(policy);
  if (!existsSync(path)) return { version: 1, projects: [] };
  const doc = parseYaml(readFileSync(path, "utf8")) as ProjectsDocument;
  if (!doc?.projects || !Array.isArray(doc.projects)) {
    throw new Error(`Invalid projects registry at ${path}`);
  }
  return doc;
}

/** Merge registry into policy.projects by id (registry fields overlay). */
export function mergeProjectsIntoPolicy(policy: PolicyDocument): PolicyDocument {
  const reg = loadProjectsDocument(policy);
  if (!reg.projects.length) return policy;

  const byId = new Map<string, ProjectScope>();
  for (const p of policy.projects || []) byId.set(p.id, { ...p });
  for (const r of reg.projects) {
    const cur = byId.get(r.id) || { id: r.id };
    byId.set(r.id, {
      ...cur,
      ...r,
      allow_hosts: r.allow_hosts ?? cur.allow_hosts,
      allow_paths: r.allow_paths ?? cur.allow_paths,
      github_repos: r.github_repos ?? cur.github_repos,
      build: r.build ? { ...cur.build, ...r.build } : cur.build,
    });
  }
  return { ...policy, projects: [...byId.values()] };
}

export function publicProjectView(
  p: ProjectScope,
  principalProjects: string[]
) {
  const allowed = principalProjects.includes(p.id);
  if (!allowed) return null;
  return {
    id: p.id,
    name: p.name || p.id,
    description: p.description || null,
    stackProfile: p.stack_profile || null,
    hosts: p.allow_hosts || [],
    pathCount: p.allow_paths?.length || 0,
    repos: p.github_repos || [],
    serverIds: p.server_ids || [],
    databaseIds: p.database_ids || [],
    deployProjectId: p.deploy_project_id || null,
    securityTargetIds: p.security_target_ids || [],
    healthCheckCount: p.health_checks?.length || 0,
    environments: p.environments || [],
    authorizedClients: p.authorized_clients || [],
  };
}
