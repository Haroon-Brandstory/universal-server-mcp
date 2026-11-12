import type { PolicyDocument, Principal } from "../../../types.js";
import type { ScannerContext, ScannerRunResult, SecurityScanner } from "../types.js";
import { redactEvidence } from "../redact.js";

/**
 * Passive server audit using ServerOps probes when available.
 * Never changes firewall/SSH config. Production: only if allow_production_scans
 * or environment is not production (enforced by caller).
 */
export function createServerAuditScanner(deps: {
  runProbes: (
    policy: PolicyDocument,
    principal: Principal,
    serverId: string
  ) => Promise<{
    security?: Record<string, string>;
    listening?: string;
    disk?: string;
  }>;
  policy: PolicyDocument;
  principal: Principal;
  serverId: string;
}): SecurityScanner {
  return {
    id: "builtin.server-audit",
    kinds: ["server"],
    async run(ctx: ScannerContext): Promise<ScannerRunResult> {
      if (ctx.forceMock) {
        return {
          scanner: "builtin.server-audit",
          mocked: true,
          findings: [
            {
              scanKind: "server",
              scanner: "builtin.server-audit",
              title: "Mock: PermitRootLogin may be enabled",
              severity: "high",
              confidence: "possible",
              evidence: "sshd_config fixture (mock)",
              affected: ["/etc/ssh/sshd_config"],
              impact: "Root SSH increases blast radius of credential theft",
              remediation: "Set PermitRootLogin no; use sudo + keys",
              ruleId: "ssh:permit-root",
            },
            {
              scanKind: "server",
              scanner: "builtin.server-audit",
              title: "Mock: unexpected listener on 0.0.0.0:2375",
              severity: "critical",
              confidence: "possible",
              evidence: "ss -lntu fixture shows docker API unbound (mock)",
              affected: ["tcp:2375"],
              impact: "Unauthenticated Docker API = host compromise",
              remediation: "Bind docker to localhost/socket; firewall drop 2375",
              ruleId: "port:docker-tcp",
            },
          ],
        };
      }
      const findings: ScannerRunResult["findings"] = [];
      try {
        const probes = await deps.runProbes(
          deps.policy,
          deps.principal,
          deps.serverId
        );
        const ssh = probes.security?.ssh || "";
        if (ssh && ssh !== "active") {
          findings.push({
            scanKind: "server",
            scanner: "builtin.server-audit",
            title: "SSH service not active",
            severity: "info",
            confidence: "likely",
            evidence: redactEvidence(`ssh status=${ssh}`),
            affected: ["sshd"],
            impact: "May indicate atypical host state",
            remediation: "Confirm intentional; ensure break-glass access path",
            ruleId: "ssh:inactive",
          });
        }
        if (probes.security?.fail2ban === "inactive") {
          findings.push({
            scanKind: "server",
            scanner: "builtin.server-audit",
            title: "fail2ban inactive",
            severity: "low",
            confidence: "likely",
            evidence: "fail2ban inactive",
            affected: ["fail2ban"],
            impact: "Weaker brute-force resistance on exposed services",
            remediation: "Enable fail2ban or equivalent rate controls",
            ruleId: "host:fail2ban",
          });
        }
        if (probes.listening) {
          if (/0\.0\.0\.0:2375|:2375\b/.test(probes.listening)) {
            findings.push({
              scanKind: "server",
              scanner: "builtin.server-audit",
              title: "Docker TCP API appears exposed",
              severity: "critical",
              confidence: "likely",
              evidence: redactEvidence("listener mentions :2375"),
              affected: ["tcp:2375"],
              impact: "Remote container/host control",
              remediation: "Disable docker tcp; use unix socket + auth",
              ruleId: "port:docker-tcp",
            });
          }
        }
      } catch (err) {
        findings.push({
          scanKind: "server",
          scanner: "builtin.server-audit",
          title: "Server audit probes failed",
          severity: "info",
          confidence: "informational",
          evidence: redactEvidence(
            err instanceof Error ? err.message : String(err)
          ),
          affected: [deps.serverId],
          impact: "Could not complete passive audit",
          remediation: "Ensure ServerOps access + mock/ssh transport configured",
          ruleId: "server:probe-failed",
        });
      }
      return {
        scanner: "builtin.server-audit",
        findings: findings.slice(0, ctx.maxFindings),
        mocked: false,
      };
    },
  };
}
