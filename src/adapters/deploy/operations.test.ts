import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PolicyDocument, Principal } from "../../types.js";
import { resetDeployApprovalsForTests } from "./approval.js";
import { resetDeployControlsForTests } from "./controls.js";
import { resetDeployHistoryForTests } from "./history.js";
import { setDeployProviderMocksForTests } from "./providers/index.js";
import { resetMockDeployProviderForTests } from "./providers/mock.js";
import {
  approvalCreate,
  history,
  listProjects,
  plan,
  productionRequest,
  rollbackPlan,
  rollbackRequest,
  staging,
  status,
  validate,
} from "./operations.js";

const fixtures = resolve(process.cwd(), "fixtures/deployops/deployments.yaml");
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GOOD = "abcdef1234567890abcdef1234567890abcdef12";
const FAIL = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function makePolicy(historyPath: string): PolicyDocument {
  return {
    version: 1,
    environment: "development",
    kill_switch: false,
    rate_limit_per_min: 60,
    projects: [{ id: "app", allow_hosts: [], allow_paths: [] }],
    principals: [],
    deny_hosts: [],
    ssrf: {
      block_private: true,
      block_loopback: false,
      block_link_local: true,
      block_metadata: true,
    },
    deployops: {
      enabled: true,
      deployments_path: fixtures,
      history_path: historyPath,
      force_mock_providers: true,
      allow_production_dispatch: false,
      require_ci_green: true,
      require_security_gate: true,
      approval_ttl_ms: 600_000,
    },
  };
}

function principal(partial: Partial<Principal> & { id: string }): Principal {
  return {
    roles: [],
    allow_hosts: [],
    capabilities: [],
    allow_methods: ["GET"],
    write: false,
    max_response_bytes: 65536,
    projects: ["app"],
    ...partial,
  };
}

let dir: string;
let policy: PolicyDocument;

afterEach(() => {
  resetDeployApprovalsForTests();
  resetDeployControlsForTests();
  resetMockDeployProviderForTests();
  setDeployProviderMocksForTests({ forceMock: false, gha: null });
  if (policy) resetDeployHistoryForTests(policy);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  dir = mkdtempSync(join(tmpdir(), "deployops-"));
  policy = makePolicy(join(dir, "history.json"));
  setDeployProviderMocksForTests({ forceMock: true });
  return policy;
}

describe("deploy authorization", () => {
  it("lists only accessible projects", () => {
    setup();
    const out = listProjects(policy, principal({ id: "ai" }));
    assert.equal(out.projects.length, 1);
    assert.equal(out.projects[0]?.projectId, "app");
  });

  it("denies other project", () => {
    setup();
    assert.throws(
      () =>
        plan(policy, principal({ id: "ai" }), {
          projectId: "other-deploy",
          environment: "staging",
        }),
      /not authorized/
    );
  });
});

describe("validate + staging", () => {
  it("rejects CI bypass", () => {
    setup();
    const v = validate(policy, principal({ id: "ai", write: true }), {
      projectId: "app",
      environment: "staging",
      commitSha: SHA,
      securityOk: true,
    });
    assert.equal(v.ok, false);
    assert.ok(v.checks.some((c) => c.id === "ci" && !c.ok));
  });

  it("dispatches staging via mock GHA and records history", async () => {
    setup();
    const p = principal({ id: "ai", write: true });
    const out = await staging(policy, p, {
      projectId: "app",
      commitSha: SHA,
      ciGreen: true,
      securityOk: true,
    });
    assert.equal(out.deploy.environment, "staging");
    assert.equal(out.deploy.status, "healthy");
    assert.equal(out.dispatch.mocked, true);

    const st = await status(policy, p, { deployId: out.deploy.id });
    assert.equal(st.deploy.id, out.deploy.id);

    const h = history(policy, p, { projectId: "app" });
    assert.ok(h.history.some((r) => r.id === out.deploy.id));
  });

  it("records failed release", async () => {
    setup();
    const out = await staging(policy, principal({ id: "ai", write: true }), {
      projectId: "app",
      commitSha: FAIL,
      ciGreen: true,
      securityOk: true,
    });
    assert.equal(out.deploy.status, "failed");
  });

  it("serializes conflicting deploys", async () => {
    setup();
    const { acquireDeployLock } = await import("./controls.js");
    acquireDeployLock("app", "staging", "held");
    await assert.rejects(
      () =>
        staging(policy, principal({ id: "ai", write: true }), {
          projectId: "app",
          commitSha: SHA,
          ciGreen: true,
          securityOk: true,
        }),
      /Conflicting deployment/
    );
  });
});

describe("production approval", () => {
  it("blocks self-approval and requires human approver", async () => {
    setup();
    const ai = principal({ id: "ai", write: true, admin: true });
    assert.throws(
      () =>
        approvalCreate(ai, policy, {
          projectId: "app",
          environment: "production",
          commitSha: SHA,
          requestorPrincipalId: "ai",
          action: "production",
        }),
      /cannot approve/
    );

    const human = principal({
      id: "human",
      write: false,
      admin: true,
      deploy_approver: true,
    });
    const a = approvalCreate(human, policy, {
      projectId: "app",
      environment: "production",
      commitSha: SHA,
      requestorPrincipalId: "ai",
      action: "production",
    });

    const out = await productionRequest(policy, ai, {
      projectId: "app",
      commitSha: SHA,
      approvalId: a.approvalId,
      ciGreen: true,
      securityOk: true,
    });
    assert.equal(out.productionDispatchEnabled, false);
    assert.ok(
      out.deploy.status === "awaiting_approval" || out.dispatch.mocked === true
    );
    assert.equal(out.deploy.approverPrincipalId, "human");

    // reuse rejected
    await assert.rejects(
      () =>
        productionRequest(policy, ai, {
          projectId: "app",
          commitSha: SHA,
          approvalId: a.approvalId,
          ciGreen: true,
          securityOk: true,
        }),
      /already used|Invalid/
    );
  });

  it("rejects SHA mismatch on approval", async () => {
    setup();
    const human = principal({
      id: "human",
      admin: true,
      deploy_approver: true,
    });
    const a = approvalCreate(human, policy, {
      projectId: "app",
      environment: "production",
      commitSha: SHA,
      requestorPrincipalId: "ai",
      action: "production",
    });
    await assert.rejects(
      () =>
        productionRequest(policy, principal({ id: "ai", write: true }), {
          projectId: "app",
          commitSha: GOOD,
          approvalId: a.approvalId,
          ciGreen: true,
          securityOk: true,
        }),
      /commitSha mismatch/
    );
  });
});

describe("rollback", () => {
  it("plans known-good rollback and executes with approval", async () => {
    setup();
    const ai = principal({ id: "ai", write: true });
    const planOut = rollbackPlan(policy, ai, {
      projectId: "app",
      environment: "production",
    });
    assert.equal(planOut.targetSha, GOOD);
    assert.ok(planOut.dbMigrationRisk);

    const human = principal({
      id: "human",
      admin: true,
      deploy_approver: true,
    });
    const a = approvalCreate(human, policy, {
      projectId: "app",
      environment: "production",
      commitSha: GOOD,
      requestorPrincipalId: "ai",
      action: "rollback",
      workflow: "deploy-production.yml",
    });

    const rb = await rollbackRequest(policy, ai, {
      projectId: "app",
      environment: "production",
      approvalId: a.approvalId,
      dbCompatOk: true,
    });
    assert.equal(rb.deploy.kind, "rollback");
    assert.equal(rb.deploy.commitSha, GOOD);
  });
});

describe("pipeline plan", () => {
  it("returns e2e steps without side effects", () => {
    setup();
    const p = plan(policy, principal({ id: "ai" }), {
      projectId: "app",
      environment: "staging",
      commitSha: SHA,
    });
    assert.ok(p.steps.some((s) => s.id === "buildops-tests"));
    assert.ok(p.steps.some((s) => s.id === "securityops"));
    assert.ok(p.steps.some((s) => s.id === "human-approval"));
  });
});
