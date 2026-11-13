import { randomUUID } from "node:crypto";
import {
  assertOperatorApproved,
  initialApprovalStatus,
} from "../../auth/operatorToken.js";

export type BuildApprovalAction = "network" | "install" | "execute";

export type BuildApproval = {
  id: string;
  principalId: string;
  projectId: string;
  actions: BuildApprovalAction[];
  summary: string;
  status: "pending" | "approved" | "denied";
  expiresAt: number;
  usesLeft: number;
  createdAt: number;
};

const store = new Map<string, BuildApproval>();

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0 || a.status === "denied") {
      store.delete(id);
    }
  }
}

export function createBuildApproval(input: {
  principalId: string;
  projectId: string;
  actions?: BuildApprovalAction[];
  summary?: string;
  ttlMs?: number;
  uses?: number;
}): BuildApproval {
  purge();
  const actions = input.actions?.length
    ? input.actions
    : (["network", "install", "execute"] as BuildApprovalAction[]);
  const approval: BuildApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    projectId: input.projectId,
    actions,
    summary:
      input.summary?.slice(0, 500) ||
      `Build ${input.projectId}: ${actions.join(", ")}`,
    status: initialApprovalStatus(),
    expiresAt: Date.now() + (input.ttlMs ?? 15 * 60_000),
    usesLeft: Math.min(Math.max(input.uses ?? 10, 1), 50),
    createdAt: Date.now(),
  };
  store.set(approval.id, approval);
  return { ...approval };
}

export function consumeBuildApproval(input: {
  approvalId: string;
  principalId: string;
  projectId: string;
  action: BuildApprovalAction;
}): void {
  purge();
  const a = store.get(input.approvalId);
  if (!a || a.expiresAt < Date.now()) {
    store.delete(input.approvalId);
    throw new Error("Invalid or expired build approval");
  }
  assertOperatorApproved(a.status);
  if (a.principalId !== input.principalId) {
    throw new Error("Build approval principal mismatch");
  }
  if (a.projectId !== input.projectId) {
    throw new Error("Build approval project mismatch");
  }
  if (!a.actions.includes(input.action)) {
    throw new Error(`Build approval does not allow ${input.action}`);
  }
  a.usesLeft -= 1;
  if (a.usesLeft <= 0) store.delete(a.id);
  else store.set(a.id, a);
}

export function listBuildApprovalsForOperator(): BuildApproval[] {
  purge();
  return [...store.values()].filter(
    (a) =>
      a.expiresAt > Date.now() &&
      a.usesLeft > 0 &&
      a.status !== "denied"
  );
}

export function setBuildApprovalOperatorStatus(
  id: string,
  status: "approved" | "denied"
): BuildApproval {
  purge();
  const a = store.get(id);
  if (!a || a.expiresAt < Date.now() || a.usesLeft <= 0) {
    throw new Error("Approval is missing or expired");
  }
  if (a.status === "denied") {
    throw new Error("Approval is already denied");
  }
  a.status = status;
  if (status === "denied") a.usesLeft = 0;
  store.set(a.id, a);
  return { ...a };
}

export function resetBuildApprovalsForTests(): void {
  store.clear();
}
