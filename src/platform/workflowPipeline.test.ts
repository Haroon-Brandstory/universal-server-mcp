import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SAFE_WORKFLOW,
  validateWorkflowPlan,
  type WorkflowPlan,
} from "./workflowPipeline.js";

describe("workflowPipeline", () => {
  it("accepts default safe staging workflow without production deploy", () => {
    const plan: WorkflowPlan = {
      steps: DEFAULT_SAFE_WORKFLOW,
      allowProductionDispatch: false,
      principalIsHumanApprover: false,
      requestorId: "agent-local-dev",
    };
    const v = validateWorkflowPlan(plan);
    assert.equal(v.ok, true);
    assert.deepEqual(v.blockedSteps, []);
  });

  it("blocks production deploy when dispatch flag false", () => {
    const plan: WorkflowPlan = {
      steps: [
        ...DEFAULT_SAFE_WORKFLOW,
        { id: "deploy_production", productionMutating: true, requiresHumanApproval: true },
      ],
      allowProductionDispatch: false,
      principalIsHumanApprover: true,
      requestorId: "agent",
      approverId: "human-ops",
    };
    const v = validateWorkflowPlan(plan);
    assert.equal(v.ok, false);
    assert.ok(v.blockedSteps.includes("deploy_production"));
    assert.ok(v.errors.some((e) => e.includes("allow_production_dispatch=false")));
  });

  it("blocks AI self-approval for production", () => {
    const plan: WorkflowPlan = {
      steps: [
        ...DEFAULT_SAFE_WORKFLOW,
        { id: "deploy_production", productionMutating: true, requiresHumanApproval: true },
      ],
      allowProductionDispatch: true,
      principalIsHumanApprover: false,
      requestorId: "agent",
      approverId: "agent",
    };
    const v = validateWorkflowPlan(plan);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("self-approve") || e.includes("differ")));
  });

  it("accepts production only with dispatch + distinct human approver", () => {
    const plan: WorkflowPlan = {
      steps: [
        ...DEFAULT_SAFE_WORKFLOW,
        { id: "deploy_production", productionMutating: true, requiresHumanApproval: true },
      ],
      allowProductionDispatch: true,
      principalIsHumanApprover: true,
      requestorId: "agent",
      approverId: "human-ops",
    };
    const v = validateWorkflowPlan(plan);
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("rejects missing security_scan", () => {
    const steps = DEFAULT_SAFE_WORKFLOW.filter((s) => s.id !== "security_scan");
    const v = validateWorkflowPlan({
      steps,
      allowProductionDispatch: false,
      principalIsHumanApprover: false,
      requestorId: "agent",
    });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("security_scan")));
  });
});
