import type { PolicyDocument, Principal } from "../../types.js";
import * as jobs from "./jobs.js";

export function detectStack(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return jobs.detect(policy, principal, String(args.projectId || ""));
}

export function listTasks(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return jobs.listTasks(policy, principal, String(args.projectId || ""));
}

export async function run(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return jobs.startJob(policy, principal, {
    projectId: String(args.projectId || ""),
    taskId: String(args.taskId || ""),
    approvalId: args.approvalId,
  });
}

export async function test(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return jobs.startJob(policy, principal, {
    projectId: String(args.projectId || ""),
    taskId: String(args.taskId || ""),
    kindFilter: "test",
    approvalId: args.approvalId,
  });
}

export async function lint(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return jobs.startJob(policy, principal, {
    projectId: String(args.projectId || ""),
    taskId: String(args.taskId || ""),
    kindFilter: "lint",
    approvalId: args.approvalId,
  });
}

export async function typecheck(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return jobs.startJob(policy, principal, {
    projectId: String(args.projectId || ""),
    taskId: String(args.taskId || ""),
    kindFilter: "typecheck",
    approvalId: args.approvalId,
  });
}

export function status(principal: Principal, args: Record<string, unknown>) {
  return jobs.getJob(principal.id, String(args.jobId || ""));
}

export function logs(principal: Principal, args: Record<string, unknown>) {
  const max = Math.min(Number(args.maxBytes || 64_000), 256_000);
  return jobs.getJobLogs(principal.id, String(args.jobId || ""), max);
}

export function cancel(principal: Principal, args: Record<string, unknown>) {
  return jobs.cancelJob(principal.id, String(args.jobId || ""));
}

export function approvalCreate(
  principal: Principal,
  args: Record<string, unknown>
) {
  const a = jobs.createApproval(principal, String(args.projectId || ""), args);
  return {
    approvalId: a.id,
    projectId: a.projectId,
    actions: a.actions,
    expiresAt: new Date(a.expiresAt).toISOString(),
    usesLeft: a.usesLeft,
  };
}
