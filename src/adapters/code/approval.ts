import { randomUUID } from "node:crypto";
import {
  assertOperatorApproved,
  initialApprovalStatus,
} from "../../auth/operatorToken.js";

export type CodeWriteAction = "code.write" | "code.edit";

export type CodeWriteApproval = {
  id: string;
  principalId: string;
  /** Optional path prefix bind (exact file or directory under allow_paths). */
  pathPrefix: string;
  actions: CodeWriteAction[];
  summary: string;
  status: "pending" | "approved" | "denied";
  expiresAt: number;
  usesLeft: number;
  createdAt: number;
};

const store = new Map<string, CodeWriteApproval>();

const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_USES = 10;

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0 || a.status === "denied") {
      store.delete(id);
    }
  }
}

export function createCodeWriteApproval(input: {
  principalId: string;
  pathPrefix?: string;
  actions?: CodeWriteAction[];
  summary?: string;
  ttlMs?: number;
  uses?: number;
}): CodeWriteApproval {
  purge();
  const actions = input.actions?.length
    ? input.actions
    : (["code.write", "code.edit"] as CodeWriteAction[]);
  for (const a of actions) {
    if (a !== "code.write" && a !== "code.edit") {
      throw new Error(`Invalid code approval action: ${a}`);
    }
  }
  const pathPrefix = (input.pathPrefix || "").trim();
  const approval: CodeWriteApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    pathPrefix,
    actions,
    summary:
      input.summary?.slice(0, 500) ||
      `Code write${pathPrefix ? ` under ${pathPrefix}` : ""}: ${actions.join(", ")}`,
    status: initialApprovalStatus(),
    expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
    usesLeft: Math.min(Math.max(input.uses ?? DEFAULT_USES, 1), 50),
    createdAt: Date.now(),
  };
  store.set(approval.id, approval);
  return { ...approval };
}

export function consumeCodeWriteApproval(input: {
  approvalId: string;
  principalId: string;
  path: string;
  action: CodeWriteAction;
}): void {
  purge();
  const a = store.get(input.approvalId);
  if (!a) throw new Error("Invalid or expired code write approval");
  if (a.expiresAt < Date.now()) {
    store.delete(input.approvalId);
    throw new Error("Invalid or expired code write approval");
  }
  assertOperatorApproved(a.status);
  if (a.principalId !== input.principalId) {
    throw new Error("Code write approval principal mismatch");
  }
  if (!a.actions.includes(input.action)) {
    throw new Error(`Code write approval does not allow ${input.action}`);
  }
  if (a.pathPrefix) {
    const p = input.path;
    if (p !== a.pathPrefix && !p.startsWith(a.pathPrefix.replace(/\/?$/, "/"))) {
      throw new Error(
        `Code write path not under approved pathPrefix: ${a.pathPrefix}`
      );
    }
  }
  a.usesLeft -= 1;
  if (a.usesLeft <= 0) store.delete(input.approvalId);
  else store.set(a.id, a);
}

export function listCodeApprovalsForOperator(): CodeWriteApproval[] {
  purge();
  return [...store.values()].filter(
    (a) =>
      a.expiresAt > Date.now() &&
      a.usesLeft > 0 &&
      a.status !== "denied"
  );
}

export function setCodeApprovalOperatorStatus(
  id: string,
  status: "approved" | "denied"
): CodeWriteApproval {
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

export function resetCodeApprovalsForTests(): void {
  store.clear();
}
