import { randomUUID } from "node:crypto";

export type BuildApprovalAction = "network" | "install" | "execute";

export type BuildApproval = {
  id: string;
  principalId: string;
  projectId: string;
  actions: BuildApprovalAction[];
  expiresAt: number;
  usesLeft: number;
};

const store = new Map<string, BuildApproval>();

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0) store.delete(id);
  }
}

export function createBuildApproval(input: {
  principalId: string;
  projectId: string;
  actions?: BuildApprovalAction[];
  ttlMs?: number;
  uses?: number;
}): BuildApproval {
  purge();
  const approval: BuildApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    projectId: input.projectId,
    actions: input.actions?.length
      ? input.actions
      : ["network", "install", "execute"],
    expiresAt: Date.now() + (input.ttlMs ?? 15 * 60_000),
    usesLeft: Math.min(Math.max(input.uses ?? 10, 1), 50),
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

export function resetBuildApprovalsForTests(): void {
  store.clear();
}
