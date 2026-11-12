import type { PolicyDocument, Principal } from "../../types.js";
import { assertRepoAllowed } from "../../policy/resolvePrincipal.js";
import {
  consumeGitWriteApproval,
  createGitWriteApproval,
  type GitWriteAction,
} from "./approval.js";
import { getGitHubClient, mapOctokitError, type GitHubClient } from "./githubClient.js";
import {
  assertBranchName,
  assertFeatureBranch,
  assertNotDeniedCommitTarget,
  DEFAULT_DENY_COMMIT_BRANCHES,
  DEFAULT_FEATURE_BRANCH_PATTERN,
  sanitizeGitError,
} from "./validation.js";

function ghCfg(policy: PolicyDocument) {
  return {
    denyCommit: policy.github?.deny_commit_branches || DEFAULT_DENY_COMMIT_BRANCHES,
    featurePattern:
      policy.github?.feature_branch_pattern || DEFAULT_FEATURE_BRANCH_PATTERN,
    requireApproval: policy.github?.require_write_approval !== false,
  };
}

function requireApproval(
  policy: PolicyDocument,
  principal: Principal,
  repoFull: string,
  action: GitWriteAction,
  approvalId: unknown
): void {
  if (!ghCfg(policy).requireApproval) return;
  const id = String(approvalId || "");
  if (!id) {
    throw new Error(
      `approvalId required for ${action}. Create one with git.approval.create first.`
    );
  }
  consumeGitWriteApproval({
    approvalId: id,
    principalId: principal.id,
    repo: repoFull,
    action,
  });
}

async function getBranchProtection(
  octokit: GitHubClient,
  owner: string,
  repo: string,
  branch: string
): Promise<{
  enabled: boolean;
  enforceAdmins?: boolean;
  requiredReviews?: number;
  raw?: unknown;
}> {
  try {
    const { data } = await octokit.repos.getBranchProtection({
      owner,
      repo,
      branch,
    });
    return {
      enabled: true,
      enforceAdmins: Boolean(data.enforce_admins?.enabled),
      requiredReviews:
        data.required_pull_request_reviews?.required_approving_review_count,
      raw: {
        required_status_checks: data.required_status_checks
          ? {
              strict: data.required_status_checks.strict,
              contexts: data.required_status_checks.contexts,
            }
          : null,
        allow_force_pushes: data.allow_force_pushes?.enabled ?? false,
        allow_deletions: data.allow_deletions?.enabled ?? false,
      },
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return { enabled: false };
    throw mapOctokitError(err);
  }
}

async function assertCommitTargetSafe(
  octokit: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
  policy: PolicyDocument
): Promise<void> {
  const cfg = ghCfg(policy);
  assertNotDeniedCommitTarget(branch, cfg.denyCommit);
  assertFeatureBranch(branch, cfg.featurePattern);
  const protection = await getBranchProtection(octokit, owner, repo, branch);
  if (protection.enabled) {
    throw new Error(
      `Refusing commit to branch with GitHub protection enabled: ${branch}`
    );
  }
}

export function approvalCreate(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>
) {
  const { full } = assertRepoAllowed(principal, String(args.repo || ""));
  // Touch policy to keep signature consistent / future env gates
  void policy;
  const actions = Array.isArray(args.actions)
    ? (args.actions.map(String) as GitWriteAction[])
    : undefined;
  const approval = createGitWriteApproval({
    principalId: principal.id,
    repo: full,
    actions,
    ttlMs: args.ttlMs ? Number(args.ttlMs) : undefined,
    uses: args.uses ? Number(args.uses) : undefined,
  });
  return {
    approvalId: approval.id,
    repo: approval.repo,
    actions: approval.actions,
    expiresAt: new Date(approval.expiresAt).toISOString(),
    usesLeft: approval.usesLeft,
  };
}

export async function repoList(principal: Principal) {
  const repos = principal.allow_repos || [];
  return {
    repos: repos.map((r) => ({ id: r })),
    count: repos.length,
  };
}

export async function repoInfo(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  const octokit = client || getGitHubClient();
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    const defaultBranch = data.default_branch;
    const protection = await getBranchProtection(
      octokit,
      owner,
      repo,
      defaultBranch
    );
    const commits = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: Math.min(Number(args.commitLimit || 10), 30),
    });
    return {
      id: full,
      name: data.name,
      private: data.private,
      defaultBranch,
      description: data.description,
      htmlUrl: data.html_url,
      visibility: data.visibility,
      protection: {
        defaultBranch,
        ...protection,
        // never echo allow_force_pushes true as something we would use
      },
      recentCommits: commits.data.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        author: c.commit.author?.name,
        date: c.commit.author?.date,
      })),
      policy: {
        denyCommitBranches: ghCfg(policy).denyCommit,
        featureBranchPattern: ghCfg(policy).featurePattern,
        requireWriteApproval: ghCfg(policy).requireApproval,
      },
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function branchList(
  principal: Principal,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  const octokit = client || getGitHubClient();
  try {
    const { data } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: Math.min(Number(args.limit || 50), 100),
    });
    return {
      repo: full,
      branches: data.map((b) => ({
        name: b.name,
        protected: b.protected,
        sha: b.commit.sha,
      })),
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function branchCreate(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  requireApproval(
    policy,
    principal,
    full,
    "git.branch.create",
    args.approvalId
  );
  const name = assertFeatureBranch(
    String(args.name || ""),
    ghCfg(policy).featurePattern
  );
  const from = assertBranchName(String(args.from || "main"));
  assertNotDeniedCommitTarget(name, ghCfg(policy).denyCommit);

  const octokit = client || getGitHubClient();
  try {
    const base = await octokit.repos.getBranch({ owner, repo, branch: from });
    const sha = base.data.commit.sha;
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${name}`,
      sha,
    });
    return {
      repo: full,
      branch: name,
      from,
      sha,
      force: false,
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function fileRead(
  principal: Principal,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  const path = String(args.path || "").replace(/^\/+/, "");
  if (!path || path.includes("..")) throw new Error("Invalid path");
  const ref = args.ref ? assertBranchName(String(args.ref)) : undefined;
  const octokit = client || getGitHubClient();
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if (Array.isArray(data)) {
      return {
        repo: full,
        path,
        type: "dir",
        entries: data.slice(0, 200).map((e) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
        })),
      };
    }
    if (data.type !== "file" || !("content" in data)) {
      throw new Error("Path is not a file");
    }
    const encoding = data.encoding || "base64";
    const content =
      encoding === "base64"
        ? Buffer.from(data.content, "base64").toString("utf8")
        : String(data.content);
    const max = 200_000;
    return {
      repo: full,
      path: data.path,
      type: "file",
      sha: data.sha,
      size: data.size,
      content:
        content.length > max
          ? content.slice(0, max) + "\n…[truncated]"
          : content,
      truncated: content.length > max,
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function diff(
  principal: Principal,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  const base = assertBranchName(String(args.base || ""));
  const head = assertBranchName(String(args.head || ""));
  const octokit = client || getGitHubClient();
  try {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });
    return {
      repo: full,
      base,
      head,
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      totalCommits: data.total_commits,
      files: (data.files || []).slice(0, 100).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch:
          f.patch && f.patch.length > 8000
            ? f.patch.slice(0, 8000) + "\n…[truncated]"
            : f.patch,
      })),
      htmlUrl: data.html_url,
      mergeConflictLikely: data.status === "diverged" && data.behind_by > 0,
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function commit(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  requireApproval(policy, principal, full, "git.commit", args.approvalId);
  const branch = assertFeatureBranch(
    String(args.branch || ""),
    ghCfg(policy).featurePattern
  );
  const message = String(args.message || "").trim();
  if (!message || message.length > 5000) {
    throw new Error("Commit message required (max 5000 chars)");
  }
  const files = args.files;
  if (!Array.isArray(files) || !files.length) {
    throw new Error("files[] required: [{ path, content }]");
  }
  if (files.length > 50) throw new Error("Max 50 files per commit");

  const octokit = client || getGitHubClient();
  try {
    await assertCommitTargetSafe(octokit, owner, repo, branch, policy);

    const ref = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const baseCommitSha = ref.data.object.sha;
    const baseCommit = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: baseCommitSha,
    });

    const treeItems: {
      path: string;
      mode: "100644";
      type: "blob";
      sha: string;
    }[] = [];

    for (const f of files) {
      const path = String((f as { path?: string }).path || "").replace(
        /^\/+/,
        ""
      );
      const content = String((f as { content?: string }).content ?? "");
      if (!path || path.includes("..")) throw new Error(`Invalid path: ${path}`);
      if (Buffer.byteLength(content, "utf8") > 512_000) {
        throw new Error(`File too large: ${path}`);
      }
      const blob = await octokit.git.createBlob({
        owner,
        repo,
        content,
        encoding: "utf-8",
      });
      treeItems.push({
        path,
        mode: "100644",
        type: "blob",
        sha: blob.data.sha,
      });
    }

    const tree = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: treeItems,
    });

    const newCommit = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.data.sha,
      parents: [baseCommitSha],
    });

    // force: never — updateRef without force rejects non-FF (concurrent edits)
    try {
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.data.sha,
        force: false,
      });
    } catch (err) {
      const mapped = mapOctokitError(err);
      throw new Error(
        `Commit created but branch update failed (possible concurrent modification): ${mapped.message}`
      );
    }

    return {
      repo: full,
      branch,
      sha: newCommit.data.sha,
      message,
      files: treeItems.map((t) => t.path),
      force: false,
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Commit created")) {
      throw err;
    }
    throw mapOctokitError(err);
  }
}

export async function prCreate(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  requireApproval(policy, principal, full, "git.pr.create", args.approvalId);
  const head = assertFeatureBranch(
    String(args.head || ""),
    ghCfg(policy).featurePattern
  );
  const base = assertBranchName(String(args.base || "main"));
  const title = String(args.title || "").trim();
  if (!title) throw new Error("title required");
  const body = args.body ? String(args.body) : undefined;
  const draft = Boolean(args.draft);

  const octokit = client || getGitHubClient();
  try {
    const { data } = await octokit.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
      draft,
    });
    return {
      repo: full,
      number: data.number,
      title: data.title,
      state: data.state,
      draft: data.draft,
      htmlUrl: data.html_url,
      head: data.head.ref,
      base: data.base.ref,
      mergeable: data.mergeable,
      mergeableState: data.mergeable_state,
      // no auto-merge — never call merges API
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function prStatus(
  principal: Principal,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  const number = Number(args.number);
  if (!Number.isFinite(number) || number < 1) {
    throw new Error("PR number required");
  }
  const octokit = client || getGitHubClient();
  try {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: number });
    const { data: reviews } = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: number,
      per_page: 50,
    });
    return {
      repo: full,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      htmlUrl: pr.html_url,
      head: pr.head.ref,
      base: pr.base.ref,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      mergeConflict:
        pr.mergeable === false || pr.mergeable_state === "dirty",
      reviews: reviews.map((r) => ({
        id: r.id,
        user: r.user?.login,
        state: r.state,
        submittedAt: r.submitted_at,
      })),
      // merge never performed by this gateway
      autoMerge: false,
    };
  } catch (err) {
    throw mapOctokitError(err);
  }
}

export async function ciStatus(
  principal: Principal,
  args: Record<string, unknown>,
  client?: GitHubClient
) {
  const { owner, repo, full } = assertRepoAllowed(
    principal,
    String(args.repo || "")
  );
  const octokit = client || getGitHubClient();
  try {
    let ref = args.ref ? assertBranchName(String(args.ref)) : undefined;
    if (args.number) {
      const number = Number(args.number);
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: number,
      });
      ref = pr.head.sha;
    }
    if (!ref) throw new Error("ref or number required");

    const [checkRuns, statuses] = await Promise.all([
      octokit.checks.listForRef({ owner, repo, ref, per_page: 50 }).catch(() => null),
      octokit.repos
        .getCombinedStatusForRef({ owner, repo, ref })
        .catch(() => null),
    ]);

    return {
      repo: full,
      ref,
      checkRuns: checkRuns
        ? checkRuns.data.check_runs.map((c) => ({
            name: c.name,
            status: c.status,
            conclusion: c.conclusion,
            htmlUrl: c.html_url,
          }))
        : [],
      combinedStatus: statuses
        ? {
            state: statuses.data.state,
            totalCount: statuses.data.total_count,
            statuses: statuses.data.statuses.slice(0, 50).map((s) => ({
              context: s.context,
              state: s.state,
              description: s.description,
            })),
          }
        : null,
    };
  } catch (err) {
    throw sanitizeGitError(mapOctokitError(err));
  }
}
