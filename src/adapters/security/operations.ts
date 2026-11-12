import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { PolicyDocument, Principal } from "../../types.js";
import * as serverops from "../server/operations.js";
import {
  getFinding,
  listFindings,
  persistFindings,
  updateFindingVerification,
} from "./findings.js";
import {
  getAccessibleTarget,
  listAccessibleTargets,
  publicTargetView,
} from "./registry.js";
import { buildRemediationPlan } from "./remediation.js";
import { scannersForKind, PINNED_TOOLS } from "./scanners/index.js";
import { createServerAuditScanner } from "./scanners/serverAudit.js";
import type {
  FindingVerification,
  ScanKind,
  ScannerRunResult,
  SecurityScanner,
} from "./types.js";

function requireSec(policy: PolicyDocument): void {
  if (policy.securityops?.enabled === false) {
    throw new Error("SecurityOps disabled in policy");
  }
}

function timeoutMs(policy: PolicyDocument): number {
  return (policy.securityops?.scanner_timeout_sec || 120) * 1000;
}

function maxFindings(policy: PolicyDocument): number {
  return Math.min(policy.securityops?.max_findings_per_scan || 200, 500);
}

function forceMock(policy: PolicyDocument): boolean {
  return (
    policy.securityops?.force_mock_scanners === true ||
    process.env.MCP_SECURITY_FORCE_MOCK === "1"
  );
}

function assertScanAllowed(
  policy: PolicyDocument,
  target: { environment: string; allowed_scans: ScanKind[] },
  kind: ScanKind
): void {
  if (!target.allowed_scans.includes(kind)) {
    throw new Error(`Scan kind not allowlisted on target: ${kind}`);
  }
  if (
    target.environment === "production" &&
    !policy.securityops?.allow_production_scans
  ) {
    // Passive audits only
    const passive: ScanKind[] = ["headers", "tls"];
    if (!passive.includes(kind)) {
      throw new Error(
        "Non-passive production scans blocked (allow_production_scans=false)"
      );
    }
  }
}

function resolveRoots(
  principal: Principal,
  projectId: string,
  scanRoots: string[] | undefined
): string[] {
  const paths = principal.allow_paths || [];
  if (!paths.length) {
    throw new Error(`No allow_paths for project ${projectId} — cannot scan`);
  }
  if (!scanRoots?.length) {
    return paths.filter((p) => existsSync(p));
  }
  const roots: string[] = [];
  for (const rel of scanRoots) {
    if (rel.startsWith("/")) {
      const ok = paths.some(
        (p) => rel === p || rel.startsWith(p.endsWith("/") ? p : `${p}/`)
      );
      if (!ok) throw new Error(`scan_root outside allow_paths: ${rel}`);
      if (existsSync(rel)) roots.push(rel);
    } else {
      for (const p of paths) {
        const cand = resolve(p, rel);
        if (cand === p || cand.startsWith(p.endsWith("/") ? p : `${p}/`)) {
          if (existsSync(cand)) roots.push(cand);
        }
      }
    }
  }
  if (!roots.length) {
    throw new Error("No resolvable scan roots under allow_paths");
  }
  return roots;
}

async function runScanners(
  policy: PolicyDocument,
  principal: Principal,
  kind: ScanKind,
  args: Record<string, unknown>,
  extra: SecurityScanner[] = []
) {
  requireSec(policy);
  const target = getAccessibleTarget(
    policy,
    principal,
    String(args.targetId || "")
  );
  assertScanAllowed(policy, target, kind);
  const roots =
    kind === "headers" || kind === "tls" || kind === "server"
      ? []
      : resolveRoots(principal, target.project_id, target.scan_roots);

  const ctx = {
    projectId: target.project_id,
    environment: target.environment,
    roots,
    timeoutMs: timeoutMs(policy),
    maxFindings: maxFindings(policy),
    forceMock: forceMock(policy),
    images: target.container_images,
    origins: target.http_origins,
  };

  const scanners = scannersForKind(kind, extra);
  const batches: ScannerRunResult[] = [];
  for (const s of scanners) {
    batches.push(await s.run(ctx));
  }
  const merged = batches.flatMap((b) =>
    b.findings.map((f) => ({
      ...f,
      scanKind: kind,
    }))
  );
  const stored = persistFindings(policy, {
    projectId: target.project_id,
    environment: target.environment,
    scanKind: kind,
    items: merged.slice(0, maxFindings(policy)),
  });
  return {
    targetId: target.id,
    projectId: target.project_id,
    environment: target.environment,
    scanKind: kind,
    scanners: batches.map((b) => ({
      id: b.scanner,
      mocked: b.mocked,
      count: b.findings.length,
    })),
    pinnedTools: PINNED_TOOLS,
    findings: stored,
    disclaimer:
      "Unverified findings are not confirmed vulnerabilities — validate before remediating",
  };
}

export function listTargets(policy: PolicyDocument, principal: Principal) {
  requireSec(policy);
  return {
    targets: listAccessibleTargets(policy, principal).map(publicTargetView),
  };
}

export async function scanCode(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return runScanners(policy, principal, "code", args);
}

export async function scanDependencies(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return runScanners(policy, principal, "dependencies", args);
}

export async function scanSecrets(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return runScanners(policy, principal, "secrets", args);
}

export async function scanContainer(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return runScanners(policy, principal, "container", args);
}

export async function auditServer(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireSec(policy);
  const target = getAccessibleTarget(
    policy,
    principal,
    String(args.targetId || "")
  );
  assertScanAllowed(policy, target, "server");
  if (!target.server_id) {
    throw new Error("Target has no server_id for security.audit.server");
  }
  const serverScanner = createServerAuditScanner({
    policy,
    principal,
    serverId: target.server_id,
    runProbes: async (pol, prin, serverId) => {
      const sec = await serverops.securityStatus(pol, prin, { serverId });
      return {
        security: sec.checks as Record<string, string>,
      };
    },
  });
  return runScanners(policy, principal, "server", args, [serverScanner]);
}

export async function auditHeaders(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return runScanners(policy, principal, "headers", args);
}

export async function auditTls(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  return runScanners(policy, principal, "tls", args);
}

export function findings(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireSec(policy);
  const projectIds = new Set(principal.projects || []);
  if (args.setVerification && args.findingId) {
    if (!principal.write) throw new Error("Principal write=false");
    const v = String(args.setVerification) as FindingVerification;
    const allowed: FindingVerification[] = [
      "unverified",
      "validated",
      "false_positive",
      "accepted_risk",
      "fixed",
    ];
    if (!allowed.includes(v)) throw new Error("Invalid verification status");
    return {
      finding: updateFindingVerification(
        policy,
        projectIds,
        String(args.findingId),
        v
      ),
    };
  }
  return {
    findings: listFindings(policy, {
      projectIds,
      projectId: args.projectId ? String(args.projectId) : undefined,
      severity: args.severity ? String(args.severity) : undefined,
      verification: args.verification ? String(args.verification) : undefined,
      findingId: args.findingId ? String(args.findingId) : undefined,
      limit: args.limit ? Number(args.limit) : 100,
    }),
  };
}

export async function remediationPlan(
  policy: PolicyDocument,
  principal: Principal,
  args: Record<string, unknown>
) {
  requireSec(policy);
  const projectIds = new Set(principal.projects || []);
  const finding = getFinding(
    policy,
    projectIds,
    String(args.findingId || "")
  );
  return buildRemediationPlan({
    policy,
    principal,
    finding,
    validateOnly: Boolean(args.validateOnly),
    execute: Boolean(args.execute),
    repo: args.repo ? String(args.repo) : undefined,
    baseBranch: args.baseBranch ? String(args.baseBranch) : undefined,
    gitApprovalId: args.gitApprovalId
      ? String(args.gitApprovalId)
      : undefined,
    buildApprovalId: args.buildApprovalId
      ? String(args.buildApprovalId)
      : undefined,
    branchName: args.branchName ? String(args.branchName) : undefined,
  });
}
