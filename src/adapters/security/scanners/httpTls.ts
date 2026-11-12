import { connect as tlsConnect } from "node:tls";
import type { ScannerContext, ScannerRunResult, SecurityScanner } from "../types.js";
import { assertSafeOrigin, redactEvidence } from "../redact.js";

const RECOMMENDED = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
];

export const headersScanner: SecurityScanner = {
  id: "builtin.headers",
  kinds: ["headers"],
  async run(ctx) {
    if (ctx.forceMock) {
      return {
        scanner: "builtin.headers",
        mocked: true,
        findings: [
          {
            scanKind: "headers",
            scanner: "builtin.headers",
            title: "Mock: missing content-security-policy",
            severity: "medium",
            confidence: "possible",
            evidence: "fixture origin (mock)",
            affected: ctx.origins || ["(fixture)"],
            impact: "Unverified mock header finding",
            remediation: "Add CSP; re-run without force_mock against allowlisted origin",
            ruleId: "header:content-security-policy",
          },
        ],
      };
    }
    const findings: ScannerRunResult["findings"] = [];
    const origins = (ctx.origins || []).map(assertSafeOrigin);
    for (const origin of origins) {
      try {
        const res = await fetch(origin, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(ctx.timeoutMs, 10_000)),
        });
        const missing = RECOMMENDED.filter(
          (h) => !res.headers.get(h)
        );
        for (const h of missing) {
          findings.push({
            scanKind: "headers",
            scanner: "builtin.headers",
            title: `Missing security header: ${h}`,
            severity: h.includes("content-security") ? "medium" : "low",
            confidence: "confirmed",
            evidence: redactEvidence(`${origin} missing ${h} (status ${res.status})`),
            affected: [origin],
            impact: "Browser clients lack defense-in-depth header controls",
            remediation: `Add ${h} at reverse proxy or app layer`,
            ruleId: `header:${h}`,
          });
        }
      } catch (err) {
        findings.push({
          scanKind: "headers",
          scanner: "builtin.headers",
          title: "Header audit request failed",
          severity: "info",
          confidence: "informational",
          evidence: redactEvidence(
            `${origin}: ${err instanceof Error ? err.message : String(err)}`
          ),
          affected: [origin],
          impact: "Could not verify headers",
          remediation: "Ensure origin reachable from MCP host; check allowlist",
          ruleId: "header:fetch-failed",
        });
      }
    }
    return {
      scanner: "builtin.headers",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: ctx.forceMock,
    };
  },
};

export const tlsScanner: SecurityScanner = {
  id: "builtin.tls",
  kinds: ["tls"],
  async run(ctx) {
    if (ctx.forceMock) {
      return {
        scanner: "builtin.tls",
        mocked: true,
        findings: [
          {
            scanKind: "tls",
            scanner: "builtin.tls",
            title: "Mock: certificate expiring within 30 days",
            severity: "medium",
            confidence: "possible",
            evidence: "fixture TLS (mock)",
            affected: ctx.origins || ["(fixture)"],
            impact: "Unverified mock TLS finding",
            remediation: "Renew cert; re-run live audit on allowlisted host",
            ruleId: "tls:expiry",
          },
        ],
      };
    }
    const findings: ScannerRunResult["findings"] = [];
    for (const origin of ctx.origins || []) {
      const u = new URL(assertSafeOrigin(origin));
      if (u.protocol !== "https:") {
        findings.push({
          scanKind: "tls",
          scanner: "builtin.tls",
          title: "Origin not HTTPS",
          severity: "medium",
          confidence: "confirmed",
          evidence: origin,
          affected: [origin],
          impact: "Cleartext transport",
          remediation: "Serve over TLS; redirect HTTP→HTTPS",
          ruleId: "tls:not-https",
        });
        continue;
      }
      const host = u.hostname;
      const port = Number(u.port || 443);
      try {
        const detail = await new Promise<{
          valid: boolean;
          daysLeft: number;
          protocol: string;
        }>((resolve, reject) => {
          const socket = tlsConnect(
            {
              host,
              port,
              servername: host,
              rejectUnauthorized: true,
              timeout: Math.min(ctx.timeoutMs, 10_000),
            },
            () => {
              const cert = socket.getPeerCertificate();
              const proto = socket.getProtocol() || "unknown";
              const validTo = cert.valid_to
                ? Date.parse(cert.valid_to)
                : NaN;
              const daysLeft = Number.isFinite(validTo)
                ? Math.floor((validTo - Date.now()) / 86_400_000)
                : -1;
              socket.end();
              resolve({
                valid: socket.authorized,
                daysLeft,
                protocol: proto,
              });
            }
          );
          socket.on("error", reject);
        });
        if (detail.daysLeft >= 0 && detail.daysLeft < 30) {
          findings.push({
            scanKind: "tls",
            scanner: "builtin.tls",
            title: "TLS certificate expiring within 30 days",
            severity: detail.daysLeft < 7 ? "high" : "medium",
            confidence: "confirmed",
            evidence: redactEvidence(
              `${host}: daysLeft=${detail.daysLeft} proto=${detail.protocol}`
            ),
            affected: [host],
            impact: "Service outage / client trust failures when cert expires",
            remediation: "Renew certificate; automate renewal (ACME)",
            ruleId: "tls:expiry",
          });
        }
        if (/TLSv1\.0|TLSv1\.1|SSLv/i.test(detail.protocol)) {
          findings.push({
            scanKind: "tls",
            scanner: "builtin.tls",
            title: "Legacy TLS protocol negotiated",
            severity: "high",
            confidence: "confirmed",
            evidence: `${host} protocol=${detail.protocol}`,
            affected: [host],
            impact: "Weak protocol may enable downgrade attacks",
            remediation: "Disable TLS1.0/1.1; require TLS1.2+",
            ruleId: "tls:legacy",
          });
        }
      } catch (err) {
        findings.push({
          scanKind: "tls",
          scanner: "builtin.tls",
          title: "TLS handshake failed or untrusted cert",
          severity: "high",
          confidence: "likely",
          evidence: redactEvidence(
            `${host}: ${err instanceof Error ? err.message : String(err)}`
          ),
          affected: [host],
          impact: "Clients may reject connection or MITM if verification disabled",
          remediation: "Fix certificate chain / hostname; never disable verification",
          ruleId: "tls:handshake",
        });
      }
    }
    return {
      scanner: "builtin.tls",
      findings: findings.slice(0, ctx.maxFindings),
      mocked: false,
    };
  },
};
