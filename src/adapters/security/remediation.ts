import type { PolicyDocument, Principal } from "../../types.js";
import * as gitops from "../git/operations.js";
import * as buildops from "../build/operations.js";
import type { SecurityFinding } from "./types.js";

export type RemediationPlan = {
  findingId: string;
  projectId: string;
  environment: string;
  validated: boolean;
  note: string;
  steps: Array<{
    id: string;
    tool: string;
    status: "planned" | "blocked" | "ready" | "done" | "skipped";
    detail: string;
  }>;
  git?: unknown;
  build?: unknown;
  pr?: unknown;
  productionRelease: {
    autoApply: false;
    requiresApproval: true;
    detail: string;
  };
};

/**
 * Build remediation plan. Optionally kick GitOps branch + BuildOps test + PR
 * when approvals and write flags present. Never mutates server/prod infra.
 */
export async function buildRemediationPlan(input: {
  policy: PolicyDocument;
  principal: Principal;
  finding: SecurityFinding;
  validateOnly?: boolean;
  execute?: boolean;
  repo?: string;
  baseBranch?: string;
  gitApprovalId?: string;
  buildApprovalId?: string;
  branchName?: string;
}): Promise<RemediationPlan> {
  const { finding, policy, principal } = input;
  const unverified =
    finding.verification === "unverified" ||
    finding.confidence === "informational" ||
    finding.confidence === "possible";

  const plan: RemediationPlan = {
    findingId: finding.id,
    projectId: finding.projectId,
    environment: finding.environment,
    validated: finding.verification === "validated",
    note: unverified
      ? "Finding not confirmed — treat recommendations as provisional until evidence validated"
      : "Finding validated/likely — proceed with careful remediation",
    steps: [
      {
        id: "validate",
        tool: "security.findings",
        status: finding.verification === "validated" ? "done" : "planned",
        detail: "Validate evidence; mark false_positive if noise",
      },
      {
        id: "propose",
        tool: "security.remediation.plan",
        status: "ready",
        detail: finding.remediation,
      },
      {
        id: "git-branch",
        tool: "git.branch.create",
        status: "planned",
        detail: "Create security fix branch via GitOps (approval required)",
      },
      {
        id: "build-test",
        tool: "build.test",
        status: "planned",
        detail: "Run curated BuildOps tests on project",
      },
      {
        id: "git-pr",
        tool: "git.pr.create",
        status: "planned",
        detail: "Open PR — human review required",
      },
      {
        id: "prod-release",
        tool: "deployops",
        status: "blocked",
        detail:
          "Production release requires separate DeployOps approval — SecurityOps will not auto-change servers",
      },
    ],
    productionRelease: {
      autoApply: false,
      requiresApproval: true,
      detail:
        "Do not automatically change server security settings or production infrastructure",
    },
  };

  if (input.validateOnly || !input.execute) {
    return plan;
  }

  if (!principal.write) {
    throw new Error("Principal write=false — cannot execute remediation steps");
  }
  if (finding.environment === "production") {
    throw new Error(
      "Refusing automated remediation execution against production findings — use PR + DeployOps"
    );
  }

  const repo = String(input.repo || "");
  if (!repo) {
    plan.steps = plan.steps.map((s) =>
      s.id === "git-branch" || s.id === "git-pr"
        ? { ...s, status: "blocked", detail: "repo required for execute" }
        : s
    );
    return plan;
  }

  const branch =
    input.branchName ||
    `fix/security-${finding.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;

  try {
    plan.git = await gitops.branchCreate(principal, policy, {
      repo,
      name: branch,
      from: input.baseBranch || "main",
      approvalId: input.gitApprovalId,
    });
    plan.steps = plan.steps.map((s) =>
      s.id === "git-branch"
        ? { ...s, status: "done", detail: `branch ${branch}` }
        : s
    );
  } catch (err) {
    plan.steps = plan.steps.map((s) =>
      s.id === "git-branch"
        ? {
            ...s,
            status: "blocked",
            detail: err instanceof Error ? err.message : String(err),
          }
        : s
    );
    return plan;
  }

  try {
    const listed = buildops.listTasks(policy, principal, {
      projectId: finding.projectId,
    }) as { tasks?: Array<{ id: string; kind?: string }> };
    const testTask =
      listed.tasks?.find((t) => t.kind === "test") ||
      listed.tasks?.find((t) => /test/i.test(t.id));
    if (testTask) {
      plan.build = await buildops.test(policy, principal, {
        projectId: finding.projectId,
        taskId: testTask.id,
        approvalId: input.buildApprovalId,
      });
      plan.steps = plan.steps.map((s) =>
        s.id === "build-test"
          ? { ...s, status: "done", detail: `task ${testTask.id}` }
          : s
      );
    } else {
      plan.steps = plan.steps.map((s) =>
        s.id === "build-test"
          ? { ...s, status: "skipped", detail: "no curated test task" }
          : s
      );
    }
  } catch (err) {
    plan.steps = plan.steps.map((s) =>
      s.id === "build-test"
        ? {
            ...s,
            status: "blocked",
            detail: err instanceof Error ? err.message : String(err),
          }
        : s
    );
  }

  try {
    plan.pr = await gitops.prCreate(principal, policy, {
      repo,
      title: `fix(security): ${finding.title}`.slice(0, 70),
      head: branch,
      base: input.baseBranch || "main",
      body: [
        "## Security remediation",
        `Finding: ${finding.id}`,
        `Severity: ${finding.severity} (confidence: ${finding.confidence})`,
        `Verification: ${finding.verification}`,
        "",
        finding.remediation,
        "",
        `Evidence: ${finding.evidence}`,
      ].join("\n"),
      approvalId: input.gitApprovalId,
    });
    plan.steps = plan.steps.map((s) =>
      s.id === "git-pr" ? { ...s, status: "done", detail: "PR created" } : s
    );
  } catch (err) {
    plan.steps = plan.steps.map((s) =>
      s.id === "git-pr"
        ? {
            ...s,
            status: "blocked",
            detail: err instanceof Error ? err.message : String(err),
          }
        : s
    );
  }

  return plan;
}
