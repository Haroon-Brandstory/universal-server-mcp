import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  consumeGitWriteApproval,
  createGitWriteApproval,
  resetGitApprovalsForTests,
} from "./approval.js";

describe("git write approvals", () => {
  beforeEach(() => resetGitApprovalsForTests());

  it("issues and consumes approval", () => {
    const a = createGitWriteApproval({
      principalId: "local-dev",
      repo: "acme/app",
      uses: 1,
    });
    consumeGitWriteApproval({
      approvalId: a.id,
      principalId: "local-dev",
      repo: "acme/app",
      action: "git.commit",
    });
    assert.throws(() =>
      consumeGitWriteApproval({
        approvalId: a.id,
        principalId: "local-dev",
        repo: "acme/app",
        action: "git.commit",
      })
    );
  });

  it("rejects cross-principal or cross-repo use", () => {
    const a = createGitWriteApproval({
      principalId: "alice",
      repo: "acme/a",
    });
    assert.throws(() =>
      consumeGitWriteApproval({
        approvalId: a.id,
        principalId: "bob",
        repo: "acme/a",
        action: "git.commit",
      })
    );
    assert.throws(() =>
      consumeGitWriteApproval({
        approvalId: a.id,
        principalId: "alice",
        repo: "acme/b",
        action: "git.commit",
      })
    );
  });
});
