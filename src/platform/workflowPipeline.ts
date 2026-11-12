/**
 * End-to-end AI development workflow plan validation (fixture / offline).
 * Does not call live GitHub/VPS/DB. Used to enforce gate order + approval rules.
 */

export type WorkflowStepId =
  | "authenticate"
  | "identify_project"
  | "read_source"
  | "create_feature_branch"
  | "apply_changes"
  | "build_test_sandbox"
  | "security_scan"
  | "generate_diff"
  | "create_pull_request"
  | "human_review"
  | "deploy_staging"
  | "verify_health"
  | "request_production_auth"
  | "deploy_production";

export interface WorkflowStep {
  id: WorkflowStepId;
  requiresHumanApproval?: boolean;
  productionMutating?: boolean;
  allowWhenProductionDispatch?: boolean;
}

export interface WorkflowPlan {
  steps: WorkflowStep[];
  allowProductionDispatch: boolean;
  principalIsHumanApprover: boolean;
  requestorId: string;
  approverId?: string;
}

export interface WorkflowValidation {
  ok: boolean;
  errors: string[];
  blockedSteps: WorkflowStepId[];
}

const REQUIRED_ORDER: WorkflowStepId[] = [
  "authenticate",
  "identify_project",
  "read_source",
  "create_feature_branch",
  "apply_changes",
  "build_test_sandbox",
  "security_scan",
  "generate_diff",
  "create_pull_request",
  "human_review",
  "deploy_staging",
  "verify_health",
  "request_production_auth",
];

export const DEFAULT_SAFE_WORKFLOW: WorkflowStep[] = REQUIRED_ORDER.map((id) => ({
  id,
  requiresHumanApproval:
    id === "human_review" ||
    id === "request_production_auth" ||
    id === "deploy_staging",
  productionMutating: false,
}));

export function validateWorkflowPlan(plan: WorkflowPlan): WorkflowValidation {
  const errors: string[] = [];
  const blockedSteps: WorkflowStepId[] = [];
  const ids = plan.steps.map((s) => s.id);

  for (const req of REQUIRED_ORDER) {
    if (!ids.includes(req)) {
      errors.push(`missing required step: ${req}`);
    }
  }

  // Order: each required step must appear in increasing index order
  let last = -1;
  for (const req of REQUIRED_ORDER) {
    const idx = ids.indexOf(req);
    if (idx === -1) continue;
    if (idx < last) errors.push(`out of order: ${req}`);
    last = idx;
  }

  if (ids.includes("apply_changes") && !ids.includes("create_feature_branch")) {
    errors.push("apply_changes without create_feature_branch");
  }

  if (ids.includes("deploy_staging") && !ids.includes("human_review")) {
    errors.push("deploy_staging without human_review");
  }

  const prod = plan.steps.find((s) => s.id === "deploy_production");
  if (prod) {
    if (!plan.allowProductionDispatch) {
      errors.push("deploy_production blocked: allow_production_dispatch=false");
      blockedSteps.push("deploy_production");
    }
    if (!plan.approverId || plan.approverId === plan.requestorId) {
      errors.push("deploy_production blocked: human approver must differ from requestor");
      blockedSteps.push("deploy_production");
    }
    if (!plan.principalIsHumanApprover) {
      errors.push("deploy_production blocked: AI cannot self-approve");
      blockedSteps.push("deploy_production");
    }
    if (!ids.includes("request_production_auth")) {
      errors.push("deploy_production without request_production_auth");
      blockedSteps.push("deploy_production");
    }
  }

  // Forbidden patterns for AI-driven workflow
  const forbidden = new Set(["unrestricted_shell", "live_app_edit", "prod_secret_inject"]);
  for (const s of plan.steps as Array<WorkflowStep & { id: string }>) {
    if (forbidden.has(s.id)) {
      errors.push(`forbidden step: ${s.id}`);
      blockedSteps.push(s.id as WorkflowStepId);
    }
  }

  return { ok: errors.length === 0, errors, blockedSteps: [...new Set(blockedSteps)] };
}
