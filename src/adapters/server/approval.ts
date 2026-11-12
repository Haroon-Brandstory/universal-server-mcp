import { randomUUID } from "node:crypto";

export type ServerMaintenanceAction =
  | "service.restart"
  | "cache.clear"
  | "maintenance.run";

export type ServerApproval = {
  id: string;
  principalId: string;
  serverId: string;
  environment: string;
  actions: ServerMaintenanceAction[];
  expiresAt: number;
  usesLeft: number;
};

const store = new Map<string, ServerApproval>();

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0) store.delete(id);
  }
}

export function createServerApproval(input: {
  principalId: string;
  serverId: string;
  environment: string;
  actions?: ServerMaintenanceAction[];
  ttlMs?: number;
  uses?: number;
}): ServerApproval {
  purge();
  const a: ServerApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    serverId: input.serverId,
    environment: input.environment,
    actions: input.actions?.length
      ? input.actions
      : ["service.restart", "cache.clear", "maintenance.run"],
    expiresAt: Date.now() + (input.ttlMs ?? 10 * 60_000),
    usesLeft: Math.min(Math.max(input.uses ?? 3, 1), 20),
  };
  store.set(a.id, a);
  return { ...a };
}

export function consumeServerApproval(input: {
  approvalId: string;
  principalId: string;
  serverId: string;
  environment: string;
  action: ServerMaintenanceAction;
  confirmServerId: string;
  confirmEnvironment: string;
}): void {
  purge();
  if (input.confirmServerId !== input.serverId) {
    throw new Error("confirmServerId mismatch");
  }
  if (input.confirmEnvironment !== input.environment) {
    throw new Error("confirmEnvironment mismatch");
  }
  const a = store.get(input.approvalId);
  if (!a || a.expiresAt < Date.now()) {
    store.delete(input.approvalId);
    throw new Error("Invalid or expired server maintenance approval");
  }
  if (a.principalId !== input.principalId) {
    throw new Error("Server approval principal mismatch");
  }
  if (a.serverId !== input.serverId) {
    throw new Error("Server approval server mismatch");
  }
  if (a.environment !== input.environment) {
    throw new Error("Server approval environment mismatch");
  }
  if (!a.actions.includes(input.action)) {
    throw new Error(`Server approval does not allow ${input.action}`);
  }
  a.usesLeft -= 1;
  if (a.usesLeft <= 0) store.delete(a.id);
  else store.set(a.id, a);
}

export function resetServerApprovalsForTests(): void {
  store.clear();
}
