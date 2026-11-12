import type { PolicyDocument, Principal } from "../types.js";

/**
 * Merge project-scoped hosts/paths/repos into an effective principal.
 * Unknown project ids ignored.
 */
export function effectivePrincipal(
  policy: PolicyDocument,
  principal: Principal
): Principal {
  const projectIds = principal.projects || [];
  const hosts = new Set(principal.allow_hosts.map((h) => h.toLowerCase()));
  const paths = new Set(principal.allow_paths || []);
  const repos = new Set(
    (principal.allow_repos || []).map((r) => r.toLowerCase())
  );

  if (projectIds.length && policy.projects?.length) {
    for (const id of projectIds) {
      const proj = policy.projects.find((p) => p.id === id);
      if (!proj) continue;
      for (const h of proj.allow_hosts || []) hosts.add(h.toLowerCase());
      for (const p of proj.allow_paths || []) paths.add(p);
      for (const r of proj.github_repos || []) repos.add(r.toLowerCase());
    }
  }

  return {
    ...principal,
    allow_hosts: [...hosts],
    allow_paths: [...paths],
    allow_repos: [...repos],
  };
}

export function findPrincipal(
  policy: PolicyDocument,
  id: string
): Principal | undefined {
  const raw = policy.principals.find((p) => p.id === id);
  return raw ? effectivePrincipal(policy, raw) : undefined;
}

/** Repos the principal may touch (owner/name, lowercased for compare). */
export function allowedRepos(principal: Principal): string[] {
  return [...(principal.allow_repos || [])];
}

export function assertRepoAllowed(
  principal: Principal,
  repoId: string
): { owner: string; repo: string; full: string } {
  const normalized = repoId.trim().toLowerCase();
  const allowed = allowedRepos(principal);
  if (!allowed.length) {
    throw new Error("No github_repos configured for principal projects");
  }
  if (!allowed.includes(normalized)) {
    throw new Error(`Repository not allowed for principal: ${repoId}`);
  }
  const [owner, repo] = normalized.split("/");
  if (!owner || !repo || normalized.split("/").length !== 2) {
    throw new Error(`Invalid repository id: ${repoId}`);
  }
  return { owner, repo, full: `${owner}/${repo}` };
}
