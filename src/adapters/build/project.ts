import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import type { BuildProjectConfig, PolicyDocument, Principal, ProjectScope } from "../../types.js";

function underRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`));
}

export function getProject(
  policy: PolicyDocument,
  principal: Principal,
  projectId: string
): ProjectScope {
  if (!principal.projects?.includes(projectId)) {
    throw new Error(`Project not authorized for principal: ${projectId}`);
  }
  const project = policy.projects?.find((p) => p.id === projectId);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return project;
}

export function resolveProjectWorkspace(
  policy: PolicyDocument,
  principal: Principal,
  projectId: string
): { project: ProjectScope; root: string; build: BuildProjectConfig } {
  const project = getProject(policy, principal, projectId);
  const build = project.build || {};
  const candidates = [
    build.workspace_path,
    ...(project.allow_paths || []),
  ].filter(Boolean) as string[];

  if (!candidates.length) {
    throw new Error(`Project ${projectId} has no allow_paths/workspace_path for BuildOps`);
  }

  const allowed = (principal.allow_paths || []).map((p) =>
    existsSync(p) ? realpathSync(p) : resolve(p)
  );

  let root: string | undefined;
  for (const c of candidates) {
    const abs = existsSync(c) ? realpathSync(c) : resolve(c);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    const ok = allowed.some((a) => underRoot(a, abs) || abs === a);
    if (!ok) {
      throw new Error(`Workspace outside principal allow_paths: ${c}`);
    }
    root = abs;
    break;
  }

  if (!root) {
    throw new Error(`No usable workspace directory for project ${projectId}`);
  }

  return { project, root, build };
}
