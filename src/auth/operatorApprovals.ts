import {
  listGitApprovalsForOperator,
  setGitApprovalOperatorStatus,
} from "../adapters/git/approval.js";
import {
  listBuildApprovalsForOperator,
  setBuildApprovalOperatorStatus,
} from "../adapters/build/approval.js";
import {
  listServerApprovalsForOperator,
  setServerApprovalOperatorStatus,
} from "../adapters/server/approval.js";
import {
  listDbApprovalsForOperator,
  setDbApprovalOperatorStatus,
} from "../adapters/db/approval.js";
import {
  listDeployApprovalsForOperator,
  setDeployApprovalOperatorStatus,
} from "../adapters/deploy/approval.js";
import { assertOperatorToken } from "./operatorToken.js";

export type OperatorApprovalRow = {
  id: string;
  module: "git" | "build" | "server" | "db" | "deploy";
  action: string;
  status: "pending" | "approved" | "denied";
  summary: string;
  permission: string;
  expiresAt: string;
  createdAt: string;
  detail: Record<string, unknown>;
};

export function listOperatorApprovals(): OperatorApprovalRow[] {
  const rows: OperatorApprovalRow[] = [];

  for (const a of listGitApprovalsForOperator()) {
    rows.push({
      id: a.id,
      module: "git",
      action: a.actions.join(","),
      status: a.status,
      summary: a.summary,
      permission: "git.write",
      expiresAt: new Date(a.expiresAt).toISOString(),
      createdAt: new Date(a.createdAt).toISOString(),
      detail: {
        repo: a.repo,
        principalId: a.principalId,
        usesLeft: a.usesLeft,
      },
    });
  }
  for (const a of listBuildApprovalsForOperator()) {
    rows.push({
      id: a.id,
      module: "build",
      action: a.actions.join(","),
      status: a.status,
      summary: a.summary,
      permission: "build.write",
      expiresAt: new Date(a.expiresAt).toISOString(),
      createdAt: new Date(a.createdAt).toISOString(),
      detail: {
        projectId: a.projectId,
        principalId: a.principalId,
        usesLeft: a.usesLeft,
      },
    });
  }
  for (const a of listServerApprovalsForOperator()) {
    rows.push({
      id: a.id,
      module: "server",
      action: a.actions.join(","),
      status: a.status,
      summary: a.summary,
      permission: "server.maintenance",
      expiresAt: new Date(a.expiresAt).toISOString(),
      createdAt: new Date(a.createdAt).toISOString(),
      detail: {
        serverId: a.serverId,
        environment: a.environment,
        principalId: a.principalId,
        usesLeft: a.usesLeft,
      },
    });
  }
  for (const a of listDbApprovalsForOperator()) {
    rows.push({
      id: a.id,
      module: "db",
      action: a.actions.join(","),
      status: a.status,
      summary: a.summary,
      permission: "db.migrate",
      expiresAt: new Date(a.expiresAt).toISOString(),
      createdAt: new Date(a.createdAt).toISOString(),
      detail: {
        connectionId: a.connectionId,
        environment: a.environment,
        principalId: a.principalId,
        usesLeft: a.usesLeft,
      },
    });
  }
  for (const a of listDeployApprovalsForOperator()) {
    rows.push({
      id: a.id,
      module: "deploy",
      action: a.action,
      status: a.status,
      summary: a.summary,
      permission: "deploy.production",
      expiresAt: new Date(a.expiresAt).toISOString(),
      createdAt: new Date(a.createdAt).toISOString(),
      detail: {
        projectId: a.projectId,
        environment: a.environment,
        commitSha: a.commitSha,
        workflow: a.workflow,
        requestorPrincipalId: a.requestorPrincipalId,
        approverPrincipalId: a.approverPrincipalId,
      },
    });
  }

  return rows.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

function findModule(id: string): OperatorApprovalRow["module"] {
  const row = listOperatorApprovals().find((r) => r.id === id);
  if (!row) throw new Error("Approval is missing or expired");
  return row.module;
}

export function approveOperatorApproval(
  id: string,
  operatorToken: string
): OperatorApprovalRow {
  assertOperatorToken(operatorToken);
  const module = findModule(id);
  switch (module) {
    case "git":
      setGitApprovalOperatorStatus(id, "approved");
      break;
    case "build":
      setBuildApprovalOperatorStatus(id, "approved");
      break;
    case "server":
      setServerApprovalOperatorStatus(id, "approved");
      break;
    case "db":
      setDbApprovalOperatorStatus(id, "approved");
      break;
    case "deploy":
      setDeployApprovalOperatorStatus(id, "approved");
      break;
  }
  const row = listOperatorApprovals().find((r) => r.id === id);
  if (!row) throw new Error("Approval missing after approve");
  return row;
}

export function denyOperatorApproval(
  id: string,
  operatorToken: string
): OperatorApprovalRow {
  assertOperatorToken(operatorToken);
  const before = listOperatorApprovals().find((r) => r.id === id);
  if (!before) throw new Error("Approval is missing or expired");
  switch (before.module) {
    case "git":
      setGitApprovalOperatorStatus(id, "denied");
      break;
    case "build":
      setBuildApprovalOperatorStatus(id, "denied");
      break;
    case "server":
      setServerApprovalOperatorStatus(id, "denied");
      break;
    case "db":
      setDbApprovalOperatorStatus(id, "denied");
      break;
    case "deploy":
      setDeployApprovalOperatorStatus(id, "denied");
      break;
  }
  return { ...before, status: "denied" };
}
