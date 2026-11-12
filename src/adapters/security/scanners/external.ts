import type { ScannerContext, ScannerRunResult, SecurityScanner } from "../types.js";
import { redactEvidence } from "../redact.js";
import { commandExists, runArgv } from "./runCmd.js";

/** Pinned CLI expectations (document versions; invoke only if present). */
export const PINNED_TOOLS = {
  semgrep: ">=1.70.0",
  trivy: ">=0.50.0",
  gitleaks: ">=8.18.0",
  "osv-scanner": ">=1.7.0",
} as const;

function mockResult(
  scanner: string,
  kind: ScannerRunResult["findings"][0]["scanKind"],
  title: string
): ScannerRunResult {
  return {
    scanner,
    mocked: true,
    findings: [
      {
        scanKind: kind,
        scanner,
        title,
        severity: "medium",
        confidence: "possible",
        evidence: `${scanner} unavailable or force_mock — fixture finding`,
        affected: ["(fixture)"],
        impact: "Unverified mock result — do not treat as confirmed vuln",
        remediation: `Install pinned ${scanner} (${PINNED_TOOLS[scanner as keyof typeof PINNED_TOOLS] || "see docs"}) in CI sandbox`,
        ruleId: `${scanner}:mock`,
      },
    ],
    rawSummary: "mocked",
  };
}

export const semgrepScanner: SecurityScanner = {
  id: "semgrep",
  kinds: ["code"],
  async run(ctx) {
    if (ctx.forceMock || !(await commandExists("semgrep"))) {
      return mockResult(
        "semgrep",
        "code",
        "Mock: Semgrep not executed (missing binary or force_mock)"
      );
    }
    const findings: ScannerRunResult["findings"] = [];
    for (const root of ctx.roots) {
      const r = await runArgv(
        [
          "semgrep",
          "scan",
          "--config",
          "p/ci",
          "--json",
          "--quiet",
          "--timeout",
          "30",
          root,
        ],
        { timeoutMs: ctx.timeoutMs }
      );
      try {
        const json = JSON.parse(r.stdout || "{}") as {
          results?: Array<{
            check_id?: string;
            path?: string;
            extra?: { severity?: string; message?: string };
          }>;
        };
        for (const hit of json.results || []) {
          findings.push({
            scanKind: "code",
            scanner: "semgrep",
            title: hit.extra?.message || hit.check_id || "Semgrep finding",
            severity:
              hit.extra?.severity?.toLowerCase() === "error"
                ? "high"
                : "medium",
            confidence: "likely",
            evidence: redactEvidence(
              `${hit.path || "?"}: ${hit.check_id || ""}`
            ),
            affected: hit.path ? [hit.path] : [],
            impact: "Static rule match — validate reachability before treating as confirmed",
            remediation: "Review Semgrep rule; patch code; add regression test",
            ruleId: hit.check_id,
          });
          if (findings.length >= ctx.maxFindings) break;
        }
      } catch {
        /* ignore parse */
      }
    }
    return {
      scanner: "semgrep",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};

export const gitleaksScanner: SecurityScanner = {
  id: "gitleaks",
  kinds: ["secrets"],
  async run(ctx) {
    if (ctx.forceMock || !(await commandExists("gitleaks"))) {
      return mockResult(
        "gitleaks",
        "secrets",
        "Mock: Gitleaks not executed (missing binary or force_mock)"
      );
    }
    const findings: ScannerRunResult["findings"] = [];
    for (const root of ctx.roots) {
      const r = await runArgv(
        ["gitleaks", "detect", "--source", root, "--report-format", "json", "--no-git", "-v"],
        { timeoutMs: ctx.timeoutMs }
      );
      try {
        const arr = JSON.parse(r.stdout || "[]") as Array<{
          RuleID?: string;
          File?: string;
          Description?: string;
        }>;
        for (const hit of arr) {
          findings.push({
            scanKind: "secrets",
            scanner: "gitleaks",
            title: hit.Description || "Secret detected",
            severity: "high",
            confidence: "likely",
            evidence: redactEvidence(`${hit.File || "?"}: ${hit.RuleID || ""}`),
            affected: hit.File ? [hit.File] : [],
            impact: "Leaked credential may enable unauthorized access",
            remediation: "Rotate credential; purge from history; add pre-commit gitleaks",
            ruleId: hit.RuleID,
          });
          if (findings.length >= ctx.maxFindings) break;
        }
      } catch {
        /* gitleaks may write to file only depending on version — treat empty as none */
      }
    }
    return {
      scanner: "gitleaks",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};

export const osvScanner: SecurityScanner = {
  id: "osv-scanner",
  kinds: ["dependencies"],
  async run(ctx) {
    if (ctx.forceMock || !(await commandExists("osv-scanner"))) {
      return mockResult(
        "osv-scanner",
        "dependencies",
        "Mock: OSV-Scanner not executed (missing binary or force_mock)"
      );
    }
    const findings: ScannerRunResult["findings"] = [];
    for (const root of ctx.roots) {
      const r = await runArgv(
        ["osv-scanner", "--format", "json", "-r", root],
        { timeoutMs: ctx.timeoutMs }
      );
      try {
        const json = JSON.parse(r.stdout || "{}") as {
          results?: Array<{
            packages?: Array<{
              package?: { name?: string };
              vulnerabilities?: Array<{ id?: string; summary?: string }>;
            }>;
          }>;
        };
        for (const res of json.results || []) {
          for (const pkg of res.packages || []) {
            for (const vuln of pkg.vulnerabilities || []) {
              findings.push({
                scanKind: "dependencies",
                scanner: "osv-scanner",
                title: vuln.summary || vuln.id || "OSV vulnerability",
                severity: "high",
                confidence: "likely",
                evidence: redactEvidence(
                  `${pkg.package?.name || "?"}: ${vuln.id || ""}`
                ),
                affected: [pkg.package?.name || "dependency"],
                impact: "Dependency advisory — confirm exploitability in context",
                remediation: "Upgrade affected package; pin patched version",
                ruleId: vuln.id,
              });
              if (findings.length >= ctx.maxFindings) break;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    return {
      scanner: "osv-scanner",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};

export const trivyScanner: SecurityScanner = {
  id: "trivy",
  kinds: ["container"],
  async run(ctx) {
    if (ctx.forceMock || !(await commandExists("trivy"))) {
      return mockResult(
        "trivy",
        "container",
        "Mock: Trivy not executed (missing binary or force_mock)"
      );
    }
    const images = ctx.images || [];
    if (!images.length) {
      return {
        scanner: "trivy",
        mocked: false,
        findings: [],
        rawSummary: "no allowlisted container images on target",
      };
    }
    const findings: ScannerRunResult["findings"] = [];
    for (const image of images) {
      if (!/^[A-Za-z0-9./:_-]+$/.test(image)) {
        throw new Error(`Unsafe container image ref: ${image}`);
      }
      const r = await runArgv(
        ["trivy", "image", "--quiet", "--format", "json", "--severity", "HIGH,CRITICAL", image],
        { timeoutMs: ctx.timeoutMs }
      );
      try {
        const json = JSON.parse(r.stdout || "{}") as {
          Results?: Array<{
            Vulnerabilities?: Array<{
              VulnerabilityID?: string;
              Title?: string;
              Severity?: string;
              PkgName?: string;
            }>;
          }>;
        };
        for (const res of json.Results || []) {
          for (const v of res.Vulnerabilities || []) {
            findings.push({
              scanKind: "container",
              scanner: "trivy",
              title: v.Title || v.VulnerabilityID || "Container CVE",
              severity:
                v.Severity?.toLowerCase() === "critical" ? "critical" : "high",
              confidence: "likely",
              evidence: redactEvidence(
                `${image} ${v.PkgName || ""} ${v.VulnerabilityID || ""}`
              ),
              affected: [image, v.PkgName || "package"],
              impact: "Image package vulnerability — validate runtime exposure",
              remediation: "Rebuild from patched base; pin digests; re-scan",
              ruleId: v.VulnerabilityID,
            });
            if (findings.length >= ctx.maxFindings) break;
          }
        }
      } catch {
        /* ignore */
      }
    }
    return {
      scanner: "trivy",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};
