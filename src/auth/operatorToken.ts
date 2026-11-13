import { timingSafeEqual } from "node:crypto";

/** Dual-auth second factor — never give this token to an AI agent. */
export function requireOperatorTokenConfigured(): string {
  if (allowDevSelfApprove()) return "dev-self-approve";
  const expected = process.env.MCP_OPERATOR_TOKEN?.trim() || "";
  if (expected.length < 16) {
    throw new Error(
      "MCP_OPERATOR_TOKEN is not configured (≥16 chars). Operator approvals cannot be granted."
    );
  }
  return expected;
}

export function assertOperatorToken(operatorToken: string): void {
  const expected = process.env.MCP_OPERATOR_TOKEN?.trim() || "";
  if (expected.length < 16) {
    throw new Error(
      "MCP_OPERATOR_TOKEN is not configured (≥16 chars). Operator approvals cannot be granted."
    );
  }
  const given = Buffer.from(operatorToken);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new Error("Operator token is invalid");
  }
}

export function operatorsPublicUrl(): string {
  const base = (process.env.MCP_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  return base ? `${base}/operators` : "/operators";
}

/** Dev/tests only — auto-mark new approvals approved. Never enable in prod. */
export function allowDevSelfApprove(): boolean {
  return process.env.MCP_ALLOW_DEV_SELF_APPROVE === "true";
}

export function initialApprovalStatus(): "pending" | "approved" {
  return allowDevSelfApprove() ? "approved" : "pending";
}

export function assertOperatorApproved(
  status: "pending" | "approved" | "denied"
): void {
  if (status === "denied") {
    throw new Error("Approval was denied by operator");
  }
  if (status !== "approved") {
    throw new Error(
      `Approval still pending. Open ${operatorsPublicUrl()}, approve with MCP_OPERATOR_TOKEN, tell the agent to proceed with the approvalId. Never give the operator token to the AI.`
    );
  }
}

export function pendingApprovalNext(approvalId: string): string {
  return `Pending at ${operatorsPublicUrl()}. Operator approves with MCP_OPERATOR_TOKEN, then tell the agent to use approvalId ${approvalId}. Never put the operator token in chat.`;
}
