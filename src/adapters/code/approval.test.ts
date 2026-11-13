import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  consumeCodeWriteApproval,
  createCodeWriteApproval,
  resetCodeApprovalsForTests,
  setCodeApprovalOperatorStatus,
} from "./approval.js";

describe("code write approvals", () => {
  const prev = process.env.MCP_ALLOW_DEV_SELF_APPROVE;

  beforeEach(() => {
    resetCodeApprovalsForTests();
    delete process.env.MCP_ALLOW_DEV_SELF_APPROVE;
  });

  afterEach(() => {
    resetCodeApprovalsForTests();
    if (prev === undefined) delete process.env.MCP_ALLOW_DEV_SELF_APPROVE;
    else process.env.MCP_ALLOW_DEV_SELF_APPROVE = prev;
  });

  it("blocks consume until operator approves", () => {
    const a = createCodeWriteApproval({
      principalId: "oauth-remote",
      pathPrefix: "/var/www/html/global-brandstory",
      uses: 1,
    });
    assert.equal(a.status, "pending");
    assert.throws(() =>
      consumeCodeWriteApproval({
        approvalId: a.id,
        principalId: "oauth-remote",
        path: "/var/www/html/global-brandstory/src/x.js",
        action: "code.edit",
      })
    );
    setCodeApprovalOperatorStatus(a.id, "approved");
    consumeCodeWriteApproval({
      approvalId: a.id,
      principalId: "oauth-remote",
      path: "/var/www/html/global-brandstory/src/x.js",
      action: "code.edit",
    });
  });

  it("enforces pathPrefix", () => {
    process.env.MCP_ALLOW_DEV_SELF_APPROVE = "true";
    const a = createCodeWriteApproval({
      principalId: "oauth-remote",
      pathPrefix: "/var/www/html/global-brandstory",
    });
    assert.throws(() =>
      consumeCodeWriteApproval({
        approvalId: a.id,
        principalId: "oauth-remote",
        path: "/var/www/html/global-backend/bsd-strapi/x.js",
        action: "code.write",
      })
    );
  });
});
