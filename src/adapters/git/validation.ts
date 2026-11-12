const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_RE =
  /^(?!.*\.\.)(?![./-])(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._\/+-]+(?<!\/)(?<!\.lock)$/;

export const DEFAULT_DENY_COMMIT_BRANCHES = [
  "main",
  "master",
  "production",
  "prod",
  "release",
];

export const DEFAULT_FEATURE_BRANCH_PATTERN =
  "^(feat|fix|chore|docs|refactor|gitops)/[A-Za-z0-9._/-]+$";

export function parseRepoId(raw: string): { owner: string; repo: string; full: string } {
  const s = String(raw || "").trim();
  if (!REPO_RE.test(s)) {
    throw new Error(
      `Invalid repository id "${raw}". Expected owner/name with safe characters.`
    );
  }
  const [owner, repo] = s.split("/");
  return { owner, repo, full: `${owner}/${repo}` };
}

export function assertBranchName(name: string): string {
  const branch = String(name || "").trim();
  if (!branch || branch.length > 200) {
    throw new Error("Invalid branch name");
  }
  if (branch === "HEAD" || branch.includes("\\") || branch.includes(" ")) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  if (!BRANCH_RE.test(branch)) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  return branch;
}

export function assertFeatureBranch(
  name: string,
  pattern = DEFAULT_FEATURE_BRANCH_PATTERN
): string {
  const branch = assertBranchName(name);
  const re = new RegExp(pattern);
  if (!re.test(branch)) {
    throw new Error(
      `Branch must match feature pattern ${pattern}: got ${branch}`
    );
  }
  return branch;
}

export function assertNotDeniedCommitTarget(
  branch: string,
  denyList: string[] = DEFAULT_DENY_COMMIT_BRANCHES
): void {
  const b = branch.toLowerCase();
  if (denyList.map((d) => d.toLowerCase()).includes(b)) {
    throw new Error(
      `Direct commits to protected/default branch denied: ${branch}`
    );
  }
}

export function sanitizeGitError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const cleaned = msg
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/ghs_[A-Za-z0-9]+/g, "[REDACTED_TOKEN]")
    .replace(/ghp_[A-Za-z0-9]+/g, "[REDACTED_TOKEN]")
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----/g, "[REDACTED_KEY]");
  return new Error(cleaned);
}
