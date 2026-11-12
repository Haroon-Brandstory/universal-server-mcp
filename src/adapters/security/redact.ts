import { redactText } from "../../security/redact.js";

const SECRETISH =
  /(api[_-]?key|secret|token|password|passwd|authorization|private[_-]?key|aws_access|AKIA[0-9A-Z]{16})/gi;

/** Redact evidence before storage/return — never echo raw secrets. */
export function redactEvidence(text: string, maxBytes = 2000): string {
  let out = String(text || "");
  out = out.replace(
    /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
    "$1[REDACTED]"
  );
  out = out.replace(
    /(ghp_|gho_|github_pat_)[A-Za-z0-9_]+/g,
    "[REDACTED_GITHUB_TOKEN]"
  );
  out = out.replace(
    /-----BEGIN[^-]+PRIVATE KEY-----[\s\S]*?-----END[^-]+PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]"
  );
  out = out.replace(SECRETISH, "[REDACTED_LABEL]");
  return redactText(out, maxBytes);
}

export function assertSafeOrigin(origin: string): string {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    throw new Error(`Invalid origin: ${origin}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Only http/https origins allowed for security audits");
  }
  return u.origin;
}
