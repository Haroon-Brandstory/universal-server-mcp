import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScannerContext, ScannerRunResult, SecurityScanner } from "../types.js";
import { redactEvidence } from "../redact.js";
import { runArgv } from "./runCmd.js";

function severityFromNpm(s: string): "critical" | "high" | "medium" | "low" | "info" {
  const x = s.toLowerCase();
  if (x === "critical") return "critical";
  if (x === "high") return "high";
  if (x === "moderate" || x === "medium") return "medium";
  if (x === "low") return "low";
  return "info";
}

export const npmAuditScanner: SecurityScanner = {
  id: "npm.audit",
  kinds: ["dependencies"],
  async run(ctx) {
    if (ctx.forceMock) {
      return mockNpm(ctx);
    }
    const findings: ScannerRunResult["findings"] = [];
    for (const root of ctx.roots) {
      if (!existsSync(join(root, "package.json"))) continue;
      try {
        const r = await runArgv(["npm", "audit", "--json", "--omit=dev"], {
          cwd: root,
          timeoutMs: ctx.timeoutMs,
        });
        // npm audit exits non-zero when vulns exist
        const json = JSON.parse(r.stdout || "{}") as {
          vulnerabilities?: Record<
            string,
            { severity?: string; via?: unknown[]; range?: string }
          >;
        };
        for (const [name, v] of Object.entries(json.vulnerabilities || {})) {
          findings.push({
            scanKind: "dependencies",
            scanner: "npm.audit",
            title: `Vulnerable dependency: ${name}`,
            severity: severityFromNpm(v.severity || "info"),
            confidence: "likely",
            evidence: redactEvidence(
              `${name}@${v.range || "?"} severity=${v.severity || "?"}`
            ),
            affected: ["package-lock.json", "package.json", name],
            impact: "Known CVE may be exploitable depending on reachability",
            remediation: `Upgrade ${name}; re-run npm audit; prefer npm audit fix --omit=dev where safe`,
            ruleId: `npm:${name}`,
          });
          if (findings.length >= ctx.maxFindings) break;
        }
      } catch {
        // Fall through to package.json heuristic if npm missing
        try {
          const pkg = JSON.parse(
            readFileSync(join(root, "package.json"), "utf8")
          ) as { dependencies?: Record<string, string> };
          if (pkg.dependencies?.["lodash"]?.startsWith("4.17.1")) {
            findings.push({
              scanKind: "dependencies",
              scanner: "npm.audit",
              title: "Potentially outdated lodash pin",
              severity: "low",
              confidence: "possible",
              evidence: "lodash version string looks old — verify with npm audit",
              affected: ["package.json"],
              impact: "May include known prototype pollution fixes missing",
              remediation: "Bump lodash; run npm audit in CI",
              ruleId: "npm:lodash-heuristic",
            });
          }
        } catch {
          /* ignore */
        }
      }
    }
    return {
      scanner: "npm.audit",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};

function mockNpm(ctx: ScannerContext): ScannerRunResult {
  const findings: ScannerRunResult["findings"] = [
    {
      scanKind: "dependencies",
      scanner: "npm.audit",
      title: "Mock: vulnerable package fixture-vuln",
      severity: "high",
      confidence: "likely",
      evidence: "fixture-vuln@1.0.0 (mock scanner)",
      affected: ["package.json"],
      impact: "Demo finding for tests — not a confirmed live vuln",
      remediation: "Upgrade fixture-vuln; treat mock findings as unverified",
      ruleId: "npm:fixture-vuln",
    },
  ];
  return {
    scanner: "npm.audit",
    mocked: true,
    findings: findings.slice(0, ctx.maxFindings),
  };
}
