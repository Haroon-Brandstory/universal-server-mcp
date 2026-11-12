import type { PolicyEnvironment } from "../../types.js";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingConfidence = "confirmed" | "likely" | "possible" | "informational";
export type FindingVerification =
  | "unverified"
  | "validated"
  | "false_positive"
  | "accepted_risk"
  | "fixed";

export type ScanKind =
  | "code"
  | "dependencies"
  | "secrets"
  | "container"
  | "server"
  | "headers"
  | "tls"
  | "framework";

export interface SecurityFinding {
  id: string;
  projectId: string;
  environment: PolicyEnvironment;
  scanKind: ScanKind;
  scanner: string;
  title: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  verification: FindingVerification;
  evidence: string;
  affected: string[];
  impact: string;
  remediation: string;
  ruleId?: string;
  createdAt: string;
  /** Never include secret values — redacted snippets only. */
  meta?: Record<string, unknown>;
}

export interface SecurityTarget {
  id: string;
  project_id: string;
  environment: PolicyEnvironment;
  enabled?: boolean;
  label?: string;
  /** Allowlisted scan kinds for this target. */
  allowed_scans: ScanKind[];
  /** Optional HTTP origins for headers/TLS (exact hosts). */
  http_origins?: string[];
  /** Optional server id from servers.yaml for server audits. */
  server_id?: string;
  /** Relative paths under project allow_paths for code/dep/secret scans. */
  scan_roots?: string[];
  /** Framework profiles to run (nextjs|strapi|wordpress). */
  frameworks?: Array<"nextjs" | "strapi" | "wordpress">;
  /** Container image refs allowlisted for trivy (exact). */
  container_images?: string[];
}

export interface SecurityTargetsDocument {
  version: number;
  targets: SecurityTarget[];
}

export interface ScannerRunResult {
  scanner: string;
  findings: Omit<
    SecurityFinding,
    "id" | "projectId" | "environment" | "createdAt" | "verification"
  >[];
  rawSummary?: string;
  mocked: boolean;
}

export interface ScannerContext {
  projectId: string;
  environment: PolicyEnvironment;
  roots: string[];
  timeoutMs: number;
  maxFindings: number;
  forceMock: boolean;
  /** Extra allowlisted inputs (images, origins). */
  images?: string[];
  origins?: string[];
}

export interface SecurityScanner {
  id: string;
  kinds: ScanKind[];
  run(ctx: ScannerContext): Promise<ScannerRunResult>;
}
