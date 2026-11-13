import { randomUUID } from "node:crypto";
import type { DeployApproval } from "./types.js";
import {
  assertOperatorApproved,
  initialApprovalStatus,
} from "../../auth/operatorToken.js";

const store = new Map<string, DeployApproval>();

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.used || a.status === "denied") store.delete(id);
  }
}

export function createDeployApproval(input: {
  approverPrincipalId: string;
  requestorPrincipalId: string;
  projectId: string;
  environment: string;
  commitSha: string;
  workflow: string;
  action: "production" | "rollback";
  ttlMs: number;
  summary?: string;
}): DeployApproval {
  purge();
  if (input.approverPrincipalId === input.requestorPrincipalId) {
    throw new Error("AI/requestor cannot approve own deployment");
  }
  if (!/^[0-9a-f]{7,40}$/i.test(input.commitSha)) {
    throw new Error("commitSha must be a git SHA");
  }
  if (!input.workflow.trim()) throw new Error("workflow required");

  const a: DeployApproval = {
    id: randomUUID(),
    approverPrincipalId: input.approverPrincipalId,
    requestorPrincipalId: input.requestorPrincipalId,
    projectId: input.projectId,
    environment: input.environment,
    commitSha: input.commitSha.toLowerCase(),
    workflow: input.workflow,
    action: input.action,
    summary:
      input.summary?.slice(0, 500) ||
      `Deploy ${input.action} ${input.projectId}/${input.environment} @ ${input.commitSha.slice(0, 7)}`,
    status: initialApprovalStatus(),
    expiresAt: Date.now() + Math.min(Math.max(input.ttlMs, 60_000), 24 * 3600_000),
    used: false,
    createdAt: Date.now(),
  };
  store.set(a.id, a);
  return { ...a };
}

export function consumeDeployApproval(input: {
  approvalId: string;
  requestorPrincipalId: string;
  projectId: string;
  environment: string;
  commitSha: string;
  workflow: string;
  action: "production" | "rollback";
}): DeployApproval {
  purge();
  const a = store.get(input.approvalId);
  if (!a) throw new Error("Invalid or expired deploy approval");
  if (a.used) throw new Error("Deploy approval already used — reuse rejected");
  if (a.expiresAt < Date.now()) {
    store.delete(a.id);
    throw new Error("Deploy approval expired");
  }
  assertOperatorApproved(a.status);
  if (a.requestorPrincipalId !== input.requestorPrincipalId) {
    throw new Error("Deploy approval requestor mismatch");
  }
  if (a.approverPrincipalId === input.requestorPrincipalId) {
    throw new Error("Approver cannot be requestor");
  }
  if (a.projectId !== input.projectId) {
    throw new Error("Deploy approval project mismatch");
  }
  if (a.environment !== input.environment) {
    throw new Error("Deploy approval environment mismatch");
  }
  if (a.commitSha !== input.commitSha.toLowerCase()) {
    throw new Error("Deploy approval commitSha mismatch");
  }
  if (a.workflow !== input.workflow) {
    throw new Error("Deploy approval workflow mismatch");
  }
  if (a.action !== input.action) {
    throw new Error("Deploy approval action mismatch");
  }
  a.used = true;
  store.set(a.id, a);
  return { ...a };
}

export function listDeployApprovalsForOperator(): DeployApproval[] {
  purge();
  return [...store.values()].filter(
    (a) => a.expiresAt > Date.now() && !a.used && a.status !== "denied"
  );
}

export function setDeployApprovalOperatorStatus(
  id: string,
  status: "approved" | "denied"
): DeployApproval {
  purge();
  const a = store.get(id);
  if (!a || a.expiresAt < Date.now() || a.used) {
    throw new Error("Approval is missing or expired");
  }
  if (a.status === "denied") {
    throw new Error("Approval is already denied");
  }
  a.status = status;
  if (status === "denied") a.used = true;
  store.set(a.id, a);
  return { ...a };
}

export function resetDeployApprovalsForTests(): void {
  store.clear();
}
