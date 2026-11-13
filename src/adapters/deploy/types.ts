import type { PolicyEnvironment } from "../../types.js";

export type DeployProviderKind =
  | "github_actions"
  | "vps"
  | "docker"
  | "pm2"
  | "systemd"
  | "vercel"
  | "mock";

export type DeployProfileId =
  | "nextjs"
  | "strapi"
  | "wordpress"
  | "django"
  | "laravel"
  | "springboot"
  | "docker"
  | "static";

export type DeployStatus =
  | "planned"
  | "validated"
  | "queued"
  | "running"
  | "healthy"
  | "failed"
  | "rolled_back"
  | "cancelled"
  | "awaiting_approval";

export interface DeployHealthCheck {
  /** Exact allowlisted URL — never AI-supplied at runtime beyond registry. */
  url: string;
  expect_status?: number;
}

export interface DeployEnvironmentConfig {
  name: PolicyEnvironment | string;
  provider: DeployProviderKind;
  profile: DeployProfileId;
  /** GitHub Actions workflow file id/name. */
  workflow?: string;
  /** ServerOps server id for VPS deploys. */
  server_id?: string;
  /** Curated deploy action id (never free-form shell). */
  action_id?: string;
  repo?: string;
  health_checks?: DeployHealthCheck[];
  /** Migration rollback risk note / require_db_compat check. */
  requires_db_compat?: boolean;
  enabled?: boolean;
}

export interface DeployProjectRecord {
  id: string;
  project_id: string;
  label?: string;
  enabled?: boolean;
  environments: DeployEnvironmentConfig[];
  /** Known-good release markers (commit SHAs). */
  known_good_shas?: string[];
}

export interface DeploymentsDocument {
  version: number;
  projects: DeployProjectRecord[];
}

export interface DeployDispatchInput {
  projectId: string;
  environment: string;
  commitSha: string;
  workflow: string;
  actionId?: string;
  serverId?: string;
  repo?: string;
  profile: DeployProfileId;
  dryRun: boolean;
}

export interface DeployDispatchResult {
  provider: DeployProviderKind;
  externalId: string;
  status: DeployStatus;
  detail: string;
  mocked: boolean;
}

export interface DeployProvider {
  kind: DeployProviderKind;
  dispatch(input: DeployDispatchInput): Promise<DeployDispatchResult>;
  status(externalId: string): Promise<{
    status: DeployStatus;
    detail: string;
  }>;
}

export interface DeployRecord {
  id: string;
  projectId: string;
  environment: string;
  commitSha: string;
  workflow: string;
  profile: DeployProfileId;
  provider: DeployProviderKind;
  kind: "deploy" | "rollback";
  status: DeployStatus;
  requestorPrincipalId: string;
  approvalId?: string;
  approverPrincipalId?: string;
  externalId?: string;
  previousDeployId?: string;
  health?: { ok: boolean; detail: string };
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}

export interface DeployApproval {
  id: string;
  /** Human approver — must differ from requestor. */
  approverPrincipalId: string;
  /** Bound requestor that may consume this approval. */
  requestorPrincipalId: string;
  projectId: string;
  environment: string;
  commitSha: string;
  workflow: string;
  action: "production" | "rollback";
  summary: string;
  /** Operator UI must approve before consume (dual auth). */
  status: "pending" | "approved" | "denied";
  expiresAt: number;
  used: boolean;
  createdAt: number;
}
