import { randomUUID } from "node:crypto";
import type { PolicyDocument, Principal } from "../../types.js";
import { createDeployApproval, consumeDeployApproval } from "./approval.js";
import { acquireDeployLock, releaseDeployLock } from "./controls.js";
import { mockHealthOk, runHealthChecks } from "./health.js";
import {
  appendDeploy,
  getDeploy,
  latestHealthy,
  listHistory,
  updateDeploy,
} from "./history.js";
import { getDeployProfile } from "./profiles.js";
import { getDeployProvider, setDeployProviderMocksForTests } from "./providers/index.js";
import {
  getAccessibleDeployProject,
  getEnvironment,
  listAccessibleDeployProjects,
  publicDeployProjectView,
} from "./registry.js";

function requireDeploy(policy: PolicyDocument): void {
  if (policy.deployops?.enabled === false) {
    throw new Error("DeployOps disabled in policy");
  }
}

function forceMock(policy: PolicyDocument): boolean {
  return (
    policy.deployops?.force_mock_providers === true ||
    process.env.MCP_DEPLOY_FORCE_MOCK === "1"
  );
}

function applyMockFlag(policy: PolicyDocument): void {
  setDeployProviderMocksForTests({ forceMock: forceMock(policy) });
}

function assertSha(sha: string): string {
  const s = String(sha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(s)) throw new Error("Invalid commitSha");
  return s;
}

function healthTimeout(policy: PolicyDocument): number {
  return policy.deployops?.health_timeout_ms || 8000;
}

export function listProjects(policy: PolicyDocument, principal: Principal) {
  requireDeploy(policy);
  return {
    projects: listAccessibleDeployProjects(policy, principal).map(
      publicDeployProjectView
    ),
  };
}

export function listEnvironments(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  const project = getAccessibleDeployProject(
    policy,
    principal,
    String(args.projectId || "")
  );
  return {
    projectId: project.project_id,
    environments: publicDeployProjectView(project).environments,
  };
}

export function history(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  const projectIds = new Set(principal.projects || []);
  return {
    history: listHistory(policy, {
      projectIds,
      projectId: args.projectId ? String(args.projectId) : undefined,
      environment: args.environment ? String(args.environment) : undefined,
      limit: args.limit ? Number(args.limit) : 50,
    }),
  };
}

/** E2E pipeline plan — does not execute side effects. */
export function plan(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  const project = getAccessibleDeployProject(
    policy,
    principal,
    String(args.projectId || "")
  );
  const environment = String(args.environment || "staging");
  const env = getEnvironment(project, environment);
  const profile = getDeployProfile(env.profile);
  const sha = args.commitSha ? assertSha(String(args.commitSha)) : "(pending)";

  const steps = [
    { id: "gitops-branch", tool: "git.branch.create", status: "required" },
    { id: "code-changes", tool: "git.commit", status: "required" },
    { id: "buildops-tests", tool: "build.test", status: "required" },
    {
      id: "securityops",
      tool: "security.scan.code",
      status: policy.deployops?.require_security_gate === false ? "optional" : "required",
    },
    { id: "pull-request", tool: "git.pr.create", status: "required" },
    { id: "human-approval", tool: "deploy.approval.create", status: "required" },
    {
      id: "staging-deploy",
      tool: "deploy.staging",
      status: environment === "staging" ? "next" : "prior",
    },
    { id: "health-verify", tool: "deploy.status", status: "required" },
    {
      id: "production-approval",
      tool: "deploy.production.request",
      status: environment === "production" ? "next" : "later",
    },
    {
      id: "production-deploy",
      tool: "provider.dispatch",
      status: "gated",
    },
    { id: "post-deploy-checks", tool: "health", status: "required" },
  ];

  return {
    projectId: project.project_id,
    environment,
    provider: env.provider,
    profile: profile.id,
    profileLabel: profile.label,
    workflow: env.workflow || profile.defaultActionId,
    commitSha: sha,
    pipelineHints: profile.pipelineHints,
    steps,
    note: "Plan only — production dispatch disabled unless allow_production_dispatch=true",
  };
}

export function validate(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  const project = getAccessibleDeployProject(
    policy,
    principal,
    String(args.projectId || "")
  );
  const environment = String(args.environment || "");
  const env = getEnvironment(project, environment);
  const sha = assertSha(String(args.commitSha || ""));
  const profile = getDeployProfile(env.profile);

  const checks: Array<{ id: string; ok: boolean; detail: string }> = [];

  checks.push({
    id: "registry",
    ok: true,
    detail: `provider=${env.provider} profile=${env.profile}`,
  });

  if (env.provider === "github_actions") {
    checks.push({
      id: "workflow",
      ok: Boolean(env.workflow),
      detail: env.workflow || "workflow missing",
    });
    checks.push({
      id: "repo",
      ok: Boolean(env.repo),
      detail: env.repo || "repo missing",
    });
  }
  if (env.provider === "vps") {
    checks.push({
      id: "server",
      ok: Boolean(env.server_id),
      detail: env.server_id || "server_id missing",
    });
    checks.push({
      id: "action",
      ok: Boolean(env.action_id || profile.defaultActionId),
      detail: env.action_id || profile.defaultActionId,
    });
  }

  const ciGreen = args.ciGreen === true || args.ciGreen === "true";
  if (policy.deployops?.require_ci_green !== false) {
    checks.push({
      id: "ci",
      ok: ciGreen,
      detail: ciGreen
        ? "CI reported green by caller"
        : "ciGreen=true required — refusing to bypass CI",
    });
  }

  const securityOk =
    args.securityOk === true ||
    args.securityOk === "true" ||
    policy.deployops?.require_security_gate === false;
  if (policy.deployops?.require_security_gate !== false) {
    checks.push({
      id: "security",
      ok: securityOk,
      detail: securityOk
        ? "security gate acknowledged"
        : "securityOk=true required after SecurityOps checks",
    });
  }

  if (env.requires_db_compat) {
    const dbOk = args.dbCompatOk === true || args.dbCompatOk === "true";
    checks.push({
      id: "db-compat",
      ok: dbOk,
      detail: dbOk
        ? "DB migration compatibility acknowledged"
        : "dbCompatOk=true required for this environment",
    });
  }

  const ok = checks.every((c) => c.ok);
  return {
    ok,
    projectId: project.project_id,
    environment,
    commitSha: sha,
    checks,
    status: ok ? "validated" : "failed",
  };
}

async function doDispatch(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>,
  kind: "deploy" | "rollback",
  environment: string,
  requireApproval: boolean,
  approvalAction: "production" | "rollback" | null
) {
  requireDeploy(policy);
  applyMockFlag(policy);
  if (!principal.write) throw new Error("Principal write=false");

  const project = getAccessibleDeployProject(
    policy,
    principal,
    String(args.projectId || "")
  );
  const env = getEnvironment(project, environment);
  const sha = assertSha(String(args.commitSha || ""));
  const profile = getDeployProfile(env.profile);
  const workflow = env.workflow || profile.defaultActionId;
  const actionId =
    kind === "rollback"
      ? "app.rollback"
      : env.action_id || profile.defaultActionId;

  const dryRun =
    environment === "production" &&
    !policy.deployops?.allow_production_dispatch;

  let approvalId: string | undefined;
  let approverPrincipalId: string | undefined;
  if (requireApproval) {
    approvalId = String(args.approvalId || "");
    if (!approvalId) {
      throw new Error(
        "approvalId required — human must create via deploy.approval.create"
      );
    }
    if (!approvalAction) throw new Error("approval action required");
    const a = consumeDeployApproval({
      approvalId,
      requestorPrincipalId: principal.id,
      projectId: project.project_id,
      environment,
      commitSha: sha,
      workflow,
      action: approvalAction,
    });
    approverPrincipalId = a.approverPrincipalId;
  }

  if (kind === "deploy" || kind === "rollback") {
    const v = validate(policy, principal, {
      projectId: project.project_id,
      environment,
      commitSha: sha,
      ciGreen: args.ciGreen ?? (kind === "rollback" ? true : undefined),
      securityOk: args.securityOk ?? (kind === "rollback" ? true : undefined),
      dbCompatOk: args.dbCompatOk,
    });
    if (!v.ok) {
      throw new Error(
        `Deploy validation failed: ${v.checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`
      );
    }
  }

  const opId = randomUUID();
  acquireDeployLock(project.project_id, environment, opId);
  try {
    // Production without allow_production_dispatch → mock/dry providers only
    if (dryRun || forceMock(policy)) {
      setDeployProviderMocksForTests({ forceMock: true });
    }

    const providerKind =
      dryRun || forceMock(policy)
        ? env.provider === "vps" || env.provider === "github_actions"
          ? env.provider
          : "mock"
        : env.provider;

    const dispatch = await getDeployProvider(providerKind).dispatch({
      projectId: project.project_id,
      environment,
      commitSha: sha,
      workflow,
      actionId,
      serverId: env.server_id,
      repo: env.repo,
      profile: env.profile,
      dryRun,
    });

    let health = { ok: false, detail: "pending" };
    if (dispatch.status === "failed") {
      health = { ok: false, detail: dispatch.detail };
    } else if (dryRun) {
      health = {
        ok: true,
        detail: "dry-run — health skipped (prod dispatch disabled)",
      };
    } else if (forceMock(policy)) {
      health = await mockHealthOk(env.health_checks);
    } else {
      health = await runHealthChecks(env.health_checks, healthTimeout(policy));
    }

    const status =
      dispatch.status === "failed"
        ? "failed"
        : dryRun
          ? "awaiting_approval"
          : health.ok
            ? "healthy"
            : "failed";

    const rec = appendDeploy(policy, {
      projectId: project.project_id,
      environment,
      commitSha: sha,
      workflow,
      profile: env.profile,
      provider: dispatch.provider,
      kind,
      status,
      requestorPrincipalId: principal.id,
      approvalId,
      approverPrincipalId,
      externalId: dispatch.externalId,
      previousDeployId: args.previousDeployId
        ? String(args.previousDeployId)
        : undefined,
      health,
      meta: {
        mocked: dispatch.mocked,
        dryRun,
        detail: dispatch.detail,
      },
    });

    return {
      deploy: rec,
      dispatch,
      productionDispatchEnabled: Boolean(
        policy.deployops?.allow_production_dispatch
      ),
    };
  } finally {
    releaseDeployLock(project.project_id, environment, opId);
  }
}

export async function staging(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return doDispatch(
    policy,
    principal,
    args,
    "deploy",
    "staging",
    false,
    null
  );
}

export async function productionRequest(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  // Production always needs human approval; dispatch only if policy allows
  return doDispatch(
    policy,
    principal,
    args,
    "deploy",
    "production",
    true,
    "production"
  );
}

export function status(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  applyMockFlag(policy);
  const projectIds = new Set(principal.projects || []);
  const rec = getDeploy(policy, projectIds, String(args.deployId || ""));
  if (rec.externalId) {
    const provider = getDeployProvider(
      forceMock(policy) ? "mock" : rec.provider
    );
    // fire status check asynchronously shape — sync await via then not needed; use mock
    return provider.status(rec.externalId).then((s) => ({
      deploy: rec,
      providerStatus: s,
    }));
  }
  return Promise.resolve({ deploy: rec, providerStatus: null });
}

export function rollbackPlan(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  const project = getAccessibleDeployProject(
    policy,
    principal,
    String(args.projectId || "")
  );
  const environment = String(args.environment || "");
  const env = getEnvironment(project, environment);
  const profile = getDeployProfile(env.profile);
  const knownGood =
    args.targetSha
      ? assertSha(String(args.targetSha))
      : project.known_good_shas?.[0] ||
        latestHealthy(policy, project.project_id, environment)?.commitSha;

  if (!knownGood) {
    throw new Error("No known-good SHA — set known_good_shas or prior healthy deploy");
  }

  const dbRisk = env.requires_db_compat
    ? "HIGH — verify migration compatibility before rollback"
    : "LOW/NONE configured";

  return {
    projectId: project.project_id,
    environment,
    targetSha: knownGood,
    provider: env.provider,
    profile: profile.id,
    rollbackHints: profile.rollbackHints,
    dbMigrationRisk: dbRisk,
    steps: [
      { id: "identify-known-good", status: "ready", detail: knownGood },
      { id: "human-approval", status: "required", tool: "deploy.approval.create" },
      { id: "rollback-request", status: "next", tool: "deploy.rollback.request" },
      { id: "health-verify", status: "required" },
      { id: "post-rollback-verify", status: "required" },
    ],
    executableViaMcp: true,
    note: "Rollback request still requires human approval; production dispatch policy applies",
  };
}

export async function rollbackRequest(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  const plan = rollbackPlan(policy, principal, args);
  return doDispatch(
    policy,
    principal,
    {
      ...args,
      commitSha: plan.targetSha,
      previousDeployId: args.previousDeployId,
      ciGreen: true,
      securityOk: true,
      dbCompatOk: args.dbCompatOk ?? true,
    },
    "rollback",
    String(args.environment || ""),
    true,
    "rollback"
  );
}

export function approvalCreate(
  principal: Principal,
  policy: PolicyDocument,
  args: Record<string, unknown>
) {
  requireDeploy(policy);
  if (!principal.deploy_approver && !principal.admin) {
    throw new Error("Principal is not a deploy_approver");
  }
  const requestorPrincipalId = String(args.requestorPrincipalId || "");
  if (!requestorPrincipalId) {
    throw new Error("requestorPrincipalId required (human approves AI requestor)");
  }
  if (requestorPrincipalId === principal.id) {
    throw new Error("AI cannot approve its own deployment");
  }

  const project = getAccessibleDeployProject(
    policy,
    principal,
    String(args.projectId || "")
  );
  const envName = String(args.environment || "");
  const env = getEnvironment(project, envName);
  const profile = getDeployProfile(env.profile);
  const workflow = String(args.workflow || env.workflow || profile.defaultActionId);

  const a = createDeployApproval({
    approverPrincipalId: principal.id,
    requestorPrincipalId,
    projectId: project.project_id,
    environment: envName,
    commitSha: assertSha(String(args.commitSha || "")),
    workflow,
    action: String(args.action || "production") as "production" | "rollback",
    ttlMs: Number(args.ttlMs || policy.deployops?.approval_ttl_ms || 3_600_000),
  });

  return {
    approvalId: a.id,
    projectId: a.projectId,
    environment: a.environment,
    commitSha: a.commitSha,
    workflow: a.workflow,
    action: a.action,
    requestorPrincipalId: a.requestorPrincipalId,
    approverPrincipalId: a.approverPrincipalId,
    expiresAt: new Date(a.expiresAt).toISOString(),
  };
}

/** Mark a healthy deploy as known-good helper for tests/operators via history. */
export function markHealthyForTests(
  policy: PolicyDocument,
  deployId: string,
  projectIds: Set<string>
) {
  const rec = getDeploy(policy, projectIds, deployId);
  return updateDeploy(policy, rec.id, { status: "healthy" });
}
