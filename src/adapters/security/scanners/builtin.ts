import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ScannerContext, ScannerRunResult, SecurityScanner } from "../types.js";
import { redactEvidence } from "../redact.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
]);

const SECRET_PATTERNS: Array<{ id: string; re: RegExp; title: string }> = [
  {
    id: "aws-access-key",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    title: "Possible AWS access key id",
  },
  {
    id: "generic-api-key",
    re: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{12,}['"]/gi,
    title: "Hardcoded secret assignment",
  },
  {
    id: "private-key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    title: "Private key material in tree",
  },
  {
    id: "jwt-like",
    re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    title: "JWT-like token in source",
  },
];

const CODE_PATTERNS: Array<{
  id: string;
  re: RegExp;
  title: string;
  severity: "high" | "medium" | "low";
  impact: string;
  remediation: string;
}> = [
  {
    id: "eval-use",
    re: /\beval\s*\(/g,
    title: "Use of eval()",
    severity: "high",
    impact: "Code injection if attacker-controlled input reaches eval",
    remediation: "Remove eval; use safe parsers or allowlists",
  },
  {
    id: "child-shell",
    re: /\b(?:exec|execSync|spawn)\s*\(\s*[`'"].*[`$]/g,
    title: "Shell command with interpolation",
    severity: "high",
    impact: "Command injection risk",
    remediation: "Pass argv arrays; never interpolate untrusted input into shell",
  },
  {
    id: "dangerouslySetInnerHTML",
    re: /dangerouslySetInnerHTML/g,
    title: "dangerouslySetInnerHTML usage",
    severity: "medium",
    impact: "XSS if HTML not sanitized",
    remediation: "Sanitize with trusted library or avoid raw HTML",
  },
  {
    id: "disable-ssl-verify",
    re: /rejectUnauthorized\s*:\s*false/g,
    title: "TLS verification disabled",
    severity: "high",
    impact: "MITM risk",
    remediation: "Keep rejectUnauthorized true; fix cert chain instead",
  },
];

function walkFiles(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile() && st.size < 512_000) {
        if (/\.(ts|tsx|js|jsx|mjs|cjs|json|env|yml|yaml|php|py|md)$/i.test(name)) {
          out.push(full);
        }
      }
      if (out.length >= maxFiles) break;
    }
  }
  return out;
}

function scanTree(
  ctx: ScannerContext,
  kind: "secrets" | "code"
): ScannerRunResult {
  const findings: ScannerRunResult["findings"] = [];
  for (const root of ctx.roots) {
    if (!existsSync(root)) continue;
    const files = walkFiles(root, 400);
    for (const file of files) {
      let text = "";
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const rel = relative(root, file) || file;
      if (kind === "secrets") {
        for (const p of SECRET_PATTERNS) {
          if (p.re.test(text)) {
            p.re.lastIndex = 0;
            findings.push({
              scanKind: "secrets",
              scanner: "builtin.secrets",
              title: p.title,
              severity: "high",
              confidence: "possible",
              evidence: redactEvidence(`${rel}: matched ${p.id}`),
              affected: [rel],
              impact: "Credential leakage if committed or logged",
              remediation: "Rotate secret; move to env/vault; add to secret scanner CI",
              ruleId: p.id,
            });
          }
          p.re.lastIndex = 0;
        }
      } else {
        for (const p of CODE_PATTERNS) {
          if (p.re.test(text)) {
            p.re.lastIndex = 0;
            findings.push({
              scanKind: "code",
              scanner: "builtin.sast",
              title: p.title,
              severity: p.severity,
              confidence: "possible",
              evidence: redactEvidence(`${rel}: matched ${p.id}`),
              affected: [rel],
              impact: p.impact,
              remediation: p.remediation,
              ruleId: p.id,
            });
          }
          p.re.lastIndex = 0;
        }
      }
      if (findings.length >= ctx.maxFindings) break;
    }
    if (findings.length >= ctx.maxFindings) break;
  }
  return {
    scanner: kind === "secrets" ? "builtin.secrets" : "builtin.sast",
    findings: findings.slice(0, ctx.maxFindings),
    mocked: false,
  };
}

export const builtinSecretsScanner: SecurityScanner = {
  id: "builtin.secrets",
  kinds: ["secrets"],
  async run(ctx) {
    return scanTree(ctx, "secrets");
  },
};

export const builtinCodeScanner: SecurityScanner = {
  id: "builtin.sast",
  kinds: ["code"],
  async run(ctx) {
    return scanTree(ctx, "code");
  },
};

export const frameworkScanner: SecurityScanner = {
  id: "builtin.framework",
  kinds: ["code", "framework"],
  async run(ctx) {
    const findings: ScannerRunResult["findings"] = [];
    for (const root of ctx.roots) {
      const nextConfig = ["next.config.js", "next.config.mjs", "next.config.ts"]
        .map((f) => join(root, f))
        .find((p) => existsSync(p));
      if (nextConfig) {
        const body = readFileSync(nextConfig, "utf8");
        if (!/headers\s*\(|async\s+headers/.test(body)) {
          findings.push({
            scanKind: "code",
            scanner: "builtin.framework",
            title: "Next.js security headers not configured in next.config",
            severity: "medium",
            confidence: "possible",
            evidence: redactEvidence(relative(root, nextConfig)),
            affected: [relative(root, nextConfig)],
            impact: "Missing CSP/HSTS increases XSS/clickjacking exposure",
            remediation: "Add security headers via next.config headers()",
            ruleId: "nextjs-headers",
          });
        }
      }
      const strapiPerm = join(root, "src", "extensions", "users-permissions");
      const strapiPkg = join(root, "package.json");
      if (existsSync(strapiPkg)) {
        try {
          const pkg = JSON.parse(readFileSync(strapiPkg, "utf8")) as {
            dependencies?: Record<string, string>;
          };
          if (pkg.dependencies?.["@strapi/strapi"]) {
            findings.push({
              scanKind: "code",
              scanner: "builtin.framework",
              title: "Review Strapi users-permissions / public role",
              severity: "medium",
              confidence: "informational",
              evidence: existsSync(strapiPerm)
                ? "users-permissions extension present"
                : "Strapi detected — verify Public role find/findOne least privilege",
              affected: ["package.json"],
              impact: "Over-permissive Public role may expose content APIs",
              remediation:
                "Audit Roles & Permissions; deny find by default; use scoped tokens",
              ruleId: "strapi-permissions-review",
            });
          }
        } catch {
          /* ignore */
        }
      }
      const wpConfig = join(root, "wp-config.php");
      if (existsSync(wpConfig)) {
        const body = readFileSync(wpConfig, "utf8");
        if (!/DISALLOW_FILE_EDIT/.test(body)) {
          findings.push({
            scanKind: "code",
            scanner: "builtin.framework",
            title: "WordPress DISALLOW_FILE_EDIT not set",
            severity: "medium",
            confidence: "likely",
            evidence: "wp-config.php missing DISALLOW_FILE_EDIT",
            affected: ["wp-config.php"],
            impact: "Compromised admin can edit plugins/themes from UI",
            remediation: "define('DISALLOW_FILE_EDIT', true);",
            ruleId: "wp-disallow-file-edit",
          });
        }
        if (/FORCE_SSL_ADMIN/.test(body) === false) {
          findings.push({
            scanKind: "code",
            scanner: "builtin.framework",
            title: "WordPress FORCE_SSL_ADMIN not set",
            severity: "low",
            confidence: "possible",
            evidence: "wp-config.php missing FORCE_SSL_ADMIN",
            affected: ["wp-config.php"],
            impact: "Admin session may travel over cleartext",
            remediation: "define('FORCE_SSL_ADMIN', true); behind TLS terminator",
            ruleId: "wp-force-ssl-admin",
          });
        }
      }
    }
    return {
      scanner: "builtin.framework",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};
