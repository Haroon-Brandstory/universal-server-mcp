import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PolicyDocument, Principal } from "../../types.js";
import { effectivePrincipal } from "../../policy/resolvePrincipal.js";
import { createGitWriteApproval, resetGitApprovalsForTests } from "./approval.js";
import {
  branchCreate,
  commit,
  diff,
  fileRead,
  prCreate,
  prStatus,
  repoInfo,
  repoList,
} from "./operations.js";

const policy: PolicyDocument = {
  version: 1,
  environment: "development",
  kill_switch: false,
  rate_limit_per_min: 60,
  projects: [
    {
      id: "proj-a",
      github_repos: ["acme/alpha"],
    },
    {
      id: "proj-b",
      github_repos: ["acme/beta"],
    },
  ],
  principals: [],
  deny_hosts: [],
  ssrf: {
    block_private: true,
    block_loopback: true,
    block_link_local: true,
    block_metadata: true,
  },
  github: {
    require_write_approval: true,
  },
};

function principalFor(projects: string[], write = true): Principal {
  return effectivePrincipal(policy, {
    id: "op",
    roles: ["operator"],
    projects,
    allow_hosts: [],
    capabilities: [],
    allow_methods: ["GET"],
    write,
    admin: true,
    max_response_bytes: 1024,
  });
}

function mockOctokit(handlers: Record<string, (...a: unknown[]) => unknown>) {
  const call = (name: string) => {
    return (...args: unknown[]) => {
      if (!handlers[name]) {
        throw Object.assign(new Error(`unexpected call ${name}`), { status: 500 });
      }
      return handlers[name](...args);
    };
  };
  return {
    repos: {
      get: call("repos.get"),
      getBranch: call("repos.getBranch"),
      getBranchProtection: call("repos.getBranchProtection"),
      listCommits: call("repos.listCommits"),
      listBranches: call("repos.listBranches"),
      getContent: call("repos.getContent"),
      compareCommits: call("repos.compareCommits"),
      getCombinedStatusForRef: call("repos.getCombinedStatusForRef"),
    },
    git: {
      createRef: call("git.createRef"),
      getRef: call("git.getRef"),
      getCommit: call("git.getCommit"),
      createBlob: call("git.createBlob"),
      createTree: call("git.createTree"),
      createCommit: call("git.createCommit"),
      updateRef: call("git.updateRef"),
    },
    pulls: {
      create: call("pulls.create"),
      get: call("pulls.get"),
      listReviews: call("pulls.listReviews"),
    },
    checks: {
      listForRef: call("checks.listForRef"),
    },
  } as unknown as import("./githubClient.js").GitHubClient;
}

describe("gitops project isolation", () => {
  beforeEach(() => resetGitApprovalsForTests());

  it("lists only project A repos", async () => {
    const p = principalFor(["proj-a"]);
    const out = await repoList(p);
    assert.deepEqual(out.repos.map((r) => r.id), ["acme/alpha"]);
  });

  it("denies Project B repo for Project A principal", async () => {
    const p = principalFor(["proj-a"]);
    await assert.rejects(
      () =>
        repoInfo(p, policy, { repo: "acme/beta" }, mockOctokit({})),
      /not allowed/
    );
  });
});

describe("gitops authorization and writes", () => {
  beforeEach(() => resetGitApprovalsForTests());

  it("requires approvalId for branch create", async () => {
    const p = principalFor(["proj-a"]);
    await assert.rejects(
      () =>
        branchCreate(
          p,
          policy,
          { repo: "acme/alpha", name: "feat/x", from: "main" },
          mockOctokit({})
        ),
      /approvalId required/
    );
  });

  it("creates feature branch with approval", async () => {
    const p = principalFor(["proj-a"]);
    const approval = createGitWriteApproval({
      principalId: p.id,
      repo: "acme/alpha",
      actions: ["git.branch.create"],
    });
    const client = mockOctokit({
      "repos.getBranch": async () => ({
        data: { commit: { sha: "abc123" } },
      }),
      "git.createRef": async () => ({ data: {} }),
    });
    const out = await branchCreate(
      p,
      policy,
      {
        repo: "acme/alpha",
        name: "feat/login",
        from: "main",
        approvalId: approval.id,
      },
      client
    );
    assert.equal(out.branch, "feat/login");
    assert.equal(out.force, false);
  });

  it("rejects commit to main even with approval", async () => {
    const p = principalFor(["proj-a"]);
    const approval = createGitWriteApproval({
      principalId: p.id,
      repo: "acme/alpha",
      actions: ["git.commit"],
    });
    await assert.rejects(
      () =>
        commit(
          p,
          policy,
          {
            repo: "acme/alpha",
            branch: "main",
            message: "nope",
            files: [{ path: "a.txt", content: "x" }],
            approvalId: approval.id,
          },
          mockOctokit({})
        ),
      /feature pattern|protected\/default|Direct commits/
    );
  });

  it("commits on feature branch; concurrent update surfaces error", async () => {
    const p = principalFor(["proj-a"]);
    const approval = createGitWriteApproval({
      principalId: p.id,
      repo: "acme/alpha",
      actions: ["git.commit"],
    });
    const client = mockOctokit({
      "repos.getBranchProtection": async () => {
        throw Object.assign(new Error("no"), { status: 404 });
      },
      "git.getRef": async () => ({ data: { object: { sha: "base" } } }),
      "git.getCommit": async () => ({
        data: { tree: { sha: "tree0" } },
      }),
      "git.createBlob": async () => ({ data: { sha: "blob1" } }),
      "git.createTree": async () => ({ data: { sha: "tree1" } }),
      "git.createCommit": async () => ({ data: { sha: "commit1" } }),
      "git.updateRef": async () => {
        throw Object.assign(new Error("Update is not a fast forward"), {
          status: 422,
          response: { data: { message: "Update is not a fast forward" } },
        });
      },
    });
    await assert.rejects(
      () =>
        commit(
          p,
          policy,
          {
            repo: "acme/alpha",
            branch: "feat/x",
            message: "add file",
            files: [{ path: "x.txt", content: "hi" }],
            approvalId: approval.id,
          },
          client
        ),
      /concurrent modification|not a fast forward|branch update failed/
    );
  });

  it("maps expired/invalid auth", async () => {
    const p = principalFor(["proj-a"]);
    const client = mockOctokit({
      "repos.get": async () => {
        throw Object.assign(new Error("Bad credentials"), { status: 401 });
      },
      "repos.getBranchProtection": async () => {
        throw Object.assign(new Error("no"), { status: 404 });
      },
      "repos.listCommits": async () => ({ data: [] }),
    });
    await assert.rejects(
      () => repoInfo(p, policy, { repo: "acme/alpha" }, client),
      /expired|authentication failed/i
    );
  });

  it("maps rate limit", async () => {
    const p = principalFor(["proj-a"]);
    const client = mockOctokit({
      "repos.getContent": async () => {
        throw Object.assign(new Error("API rate limit exceeded"), {
          status: 403,
          response: { data: { message: "API rate limit exceeded" } },
        });
      },
    });
    await assert.rejects(
      () => fileRead(p, { repo: "acme/alpha", path: "README.md" }, client),
      /rate limit/i
    );
  });

  it("rejects malformed path", async () => {
    const p = principalFor(["proj-a"]);
    await assert.rejects(
      () => fileRead(p, { repo: "acme/alpha", path: "../secret" }, mockOctokit({})),
      /Invalid path/
    );
  });

  it("creates PR without merge", async () => {
    const p = principalFor(["proj-a"]);
    const approval = createGitWriteApproval({
      principalId: p.id,
      repo: "acme/alpha",
      actions: ["git.pr.create"],
    });
    const client = mockOctokit({
      "pulls.create": async () => ({
        data: {
          number: 7,
          title: "feat",
          state: "open",
          draft: false,
          html_url: "https://github.com/acme/alpha/pull/7",
          head: { ref: "feat/x" },
          base: { ref: "main" },
          mergeable: true,
          mergeable_state: "clean",
        },
      }),
    });
    const out = await prCreate(
      p,
      policy,
      {
        repo: "acme/alpha",
        title: "feat",
        head: "feat/x",
        base: "main",
        approvalId: approval.id,
      },
      client
    );
    assert.equal(out.number, 7);
    assert.equal((out as { autoMerge?: boolean }).autoMerge, undefined);
  });

  it("reports merge conflicts on PR status", async () => {
    const p = principalFor(["proj-a"]);
    const client = mockOctokit({
      "pulls.get": async () => ({
        data: {
          number: 3,
          title: "t",
          state: "open",
          draft: false,
          html_url: "https://example/pr/3",
          head: { ref: "feat/x" },
          base: { ref: "main" },
          mergeable: false,
          mergeable_state: "dirty",
        },
      }),
      "pulls.listReviews": async () => ({ data: [] }),
    });
    const out = await prStatus(p, { repo: "acme/alpha", number: 3 }, client);
    assert.equal(out.mergeConflict, true);
  });

  it("diff flags divergence", async () => {
    const p = principalFor(["proj-a"]);
    const client = mockOctokit({
      "repos.compareCommits": async () => ({
        data: {
          status: "diverged",
          ahead_by: 2,
          behind_by: 1,
          total_commits: 2,
          files: [],
          html_url: "https://example/compare",
        },
      }),
    });
    const out = await diff(
      p,
      { repo: "acme/alpha", base: "main", head: "feat/x" },
      client
    );
    assert.equal(out.mergeConflictLikely, true);
  });
});
