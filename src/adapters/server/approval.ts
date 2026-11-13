import { randomUUID } from "node:crypto";
import {
  assertOperatorApproved,
  initialApprovalStatus,
} from "../../auth/operatorToken.js";

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
  summary: string;
  status: "pending" | "approved" | "denied";
  expiresAt: number;
  usesLeft: number;
  createdAt: number;
};

const store = new Map<string, ServerApproval>();

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0 || a.status === "denied") {
      store.delete(id);
    }
  }
}

export function createServerApproval(input: {
  principalId: string;
  serverId: string;
  environment: string;
  actions?: ServerMaintenanceAction[];
  summary?: string;
  ttlMs?: number;
  uses?: number;
}): ServerApproval {
  purge();
  const actions = input.actions?.length
    ? input.actions
    : ([
        "service.restart",
        "cache.clear",
        "maintenance.run",
      ] as ServerMaintenanceAction[]);
  const a: ServerApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    serverId: input.serverId,
    environment: input.environment,
    actions,
    summary:
      input.summary?.slice(0, 500) ||
      `Server ${input.serverId}/${input.environment}: ${actions.join(", ")}`,
    status: initialApprovalStatus(),
    expiresAt: Date.now() + (input.ttlMs ?? 10 * 60_000),
    usesLeft: Math.min(Math.max(input.uses ?? 3, 1), 20),
    createdAt: Date.now(),
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
  assertOperatorApproved(a.status);
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

export function listServerApprovalsForOperator(): ServerApproval[] {
  purge();
  return [...store.values()].filter(
    (a) =>
      a.expiresAt > Date.now() &&
      a.usesLeft > 0 &&
      a.status !== "denied"
  );
}

export function setServerApprovalOperatorStatus(
  id: string,
  status: "approved" | "denied"
): ServerApproval {
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

export function resetServerApprovalsForTests(): void {
  store.clear();
}
