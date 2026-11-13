import { randomUUID } from "node:crypto";
import {
  assertOperatorApproved,
  initialApprovalStatus,
} from "../../auth/operatorToken.js";

export type GitWriteAction =
  | "git.branch.create"
  | "git.commit"
  | "git.pr.create";

export type GitWriteApproval = {
  id: string;
  principalId: string;
  repo: string;
  actions: GitWriteAction[];
  summary: string;
  status: "pending" | "approved" | "denied";
  expiresAt: number;
  usesLeft: number;
  createdAt: number;
};

const store = new Map<string, GitWriteApproval>();

const DEFAULT_TTL_MS = 15 * 60_000;
const DEFAULT_USES = 5;

function purge(): void {
  const now = Date.now();
  for (const [id, a] of store) {
    if (a.expiresAt < now || a.usesLeft <= 0 || a.status === "denied") {
      store.delete(id);
    }
  }
}

export function createGitWriteApproval(input: {
  principalId: string;
  repo: string;
  actions?: GitWriteAction[];
  summary?: string;
  ttlMs?: number;
  uses?: number;
}): GitWriteApproval {
  purge();
  const actions = input.actions?.length
    ? input.actions
    : (["git.branch.create", "git.commit", "git.pr.create"] as GitWriteAction[]);
  for (const a of actions) {
    if (
      a !== "git.branch.create" &&
      a !== "git.commit" &&
      a !== "git.pr.create"
    ) {
      throw new Error(`Invalid approval action: ${a}`);
    }
  }
  const repo = input.repo.toLowerCase();
  const approval: GitWriteApproval = {
    id: randomUUID(),
    principalId: input.principalId,
    repo,
    actions,
    summary:
      input.summary?.slice(0, 500) ||
      `Git write on ${repo}: ${actions.join(", ")}`,
    status: initialApprovalStatus(),
    expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
    usesLeft: Math.min(Math.max(input.uses ?? DEFAULT_USES, 1), 20),
    createdAt: Date.now(),
  };
  store.set(approval.id, approval);
  return { ...approval };
}

export function consumeGitWriteApproval(input: {
  approvalId: string;
  principalId: string;
  repo: string;
  action: GitWriteAction;
}): void {
  purge();
  const a = store.get(input.approvalId);
  if (!a) throw new Error("Invalid or expired git write approval");
  if (a.expiresAt < Date.now()) {
    store.delete(input.approvalId);
    throw new Error("Invalid or expired git write approval");
  }
  assertOperatorApproved(a.status);
  if (a.principalId !== input.principalId) {
    throw new Error("Git write approval principal mismatch");
  }
  if (a.repo !== input.repo.toLowerCase()) {
    throw new Error("Git write approval repo mismatch");
  }
  if (!a.actions.includes(input.action)) {
    throw new Error(`Git write approval does not allow ${input.action}`);
  }
  a.usesLeft -= 1;
  if (a.usesLeft <= 0) store.delete(input.approvalId);
  else store.set(a.id, a);
}

export function listGitApprovalsForOperator(): GitWriteApproval[] {
  purge();
  return [...store.values()].filter(
    (a) =>
      a.expiresAt > Date.now() &&
      a.usesLeft > 0 &&
      a.status !== "denied"
  );
}

export function setGitApprovalOperatorStatus(
  id: string,
  status: "approved" | "denied"
): GitWriteApproval {
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

/** Test helper */
export function resetGitApprovalsForTests(): void {
  store.clear();
}
