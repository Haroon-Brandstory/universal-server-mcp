import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createGitWriteApproval,
  consumeGitWriteApproval,
  resetGitApprovalsForTests,
} from "../adapters/git/approval.js";
import {
  approveOperatorApproval,
  denyOperatorApproval,
  listOperatorApprovals,
} from "./operatorApprovals.js";

describe("operator dual-auth approvals", () => {
  const prevSelf = process.env.MCP_ALLOW_DEV_SELF_APPROVE;
  const prevTok = process.env.MCP_OPERATOR_TOKEN;

  beforeEach(() => {
    resetGitApprovalsForTests();
    delete process.env.MCP_ALLOW_DEV_SELF_APPROVE;
    process.env.MCP_OPERATOR_TOKEN = "test-operator-token-16chars";
  });

  afterEach(() => {
    resetGitApprovalsForTests();
    if (prevSelf === undefined) delete process.env.MCP_ALLOW_DEV_SELF_APPROVE;
    else process.env.MCP_ALLOW_DEV_SELF_APPROVE = prevSelf;
    if (prevTok === undefined) delete process.env.MCP_OPERATOR_TOKEN;
    else process.env.MCP_OPERATOR_TOKEN = prevTok;
  });

  it("create stays pending until operator approves", () => {
    const a = createGitWriteApproval({
      principalId: "local-dev",
      repo: "acme/app",
      uses: 1,
    });
    assert.equal(a.status, "pending");
    assert.throws(() =>
      consumeGitWriteApproval({
        approvalId: a.id,
        principalId: "local-dev",
        repo: "acme/app",
        action: "git.commit",
      })
    );
    const row = approveOperatorApproval(a.id, "test-operator-token-16chars");
    assert.equal(row.status, "approved");
    consumeGitWriteApproval({
      approvalId: a.id,
      principalId: "local-dev",
      repo: "acme/app",
      action: "git.commit",
    });
  });

  it("deny blocks consume", () => {
    const a = createGitWriteApproval({
      principalId: "local-dev",
      repo: "acme/app",
    });
    denyOperatorApproval(a.id, "test-operator-token-16chars");
    assert.equal(listOperatorApprovals().find((r) => r.id === a.id), undefined);
    assert.throws(() =>
      consumeGitWriteApproval({
        approvalId: a.id,
        principalId: "local-dev",
        repo: "acme/app",
        action: "git.commit",
      })
    );
  });

  it("rejects wrong operator token", () => {
    const a = createGitWriteApproval({
      principalId: "local-dev",
      repo: "acme/app",
    });
    assert.throws(() => approveOperatorApproval(a.id, "wrong-token-xxxxxxx"));
  });
});
