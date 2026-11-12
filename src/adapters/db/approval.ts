import { randomUUID } from "node:crypto";

export type DbApprovalAction =
  | "migration.apply"
  | "backup"
  | "restore";

export type DbApproval = {
  id: string;
  principalId: string;
  connectionId: string;
  environment: string;
  actions: DbApprovalAction[];
  /** Required for destructive migration.apply when policy demands. */
  backupVerifiedId?: string;
  expiresAt: number;
  usesLeft: number;
};

const store = new Map<string, DbApproval>();

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0) store.delete(id);
  }
}

export function createDbApproval(input: {
  principalId: string;
  connectionId: string;
  environment: string;
  actions?: DbApprovalAction[];
  backupVerifiedId?: string;
  ttlMs?: number;
  uses?: number;
}): DbApproval {
  purge();
  const a: DbApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    connectionId: input.connectionId,
    environment: input.environment,
    actions: input.actions?.length
      ? input.actions
      : ["migration.apply"],
    backupVerifiedId: input.backupVerifiedId,
    expiresAt: Date.now() + (input.ttlMs ?? 15 * 60_000),
    usesLeft: Math.min(Math.max(input.uses ?? 3, 1), 20),
  };
  store.set(a.id, a);
  return { ...a };
}

export function consumeDbApproval(input: {
  approvalId: string;
  principalId: string;
  connectionId: string;
  environment: string;
  action: DbApprovalAction;
  confirmConnectionId: string;
  confirmEnvironment: string;
  requireBackupVerified?: boolean;
}): DbApproval {
  purge();
  if (input.confirmConnectionId !== input.connectionId) {
    throw new Error("confirmConnectionId mismatch");
  }
  if (input.confirmEnvironment !== input.environment) {
    throw new Error("confirmEnvironment mismatch");
  }
  const a = store.get(input.approvalId);
  if (!a || a.expiresAt < Date.now()) {
    store.delete(input.approvalId);
    throw new Error("Invalid or expired database approval");
  }
  if (a.principalId !== input.principalId) {
    throw new Error("Database approval principal mismatch");
  }
  if (a.connectionId !== input.connectionId) {
    throw new Error("Database approval connection mismatch");
  }
  if (a.environment !== input.environment) {
    throw new Error("Database approval environment mismatch");
  }
  if (!a.actions.includes(input.action)) {
    throw new Error(`Database approval does not allow ${input.action}`);
  }
  if (input.requireBackupVerified && input.action === "migration.apply") {
    if (!a.backupVerifiedId) {
      throw new Error(
        "backupVerifiedId required on approval before destructive migration"
      );
    }
  }
  a.usesLeft -= 1;
  if (a.usesLeft <= 0) store.delete(a.id);
  else store.set(a.id, a);
  return { ...a };
}

export function resetDbApprovalsForTests(): void {
  store.clear();
}
