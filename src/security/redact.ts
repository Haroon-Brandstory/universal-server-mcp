const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /(?<=Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, replace: "[REDACTED_TOKEN]" },
  { re: /(?<=api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9\-._]{8,}/gi, replace: "[REDACTED_KEY]" },
  { re: /\b\d{13,19}\b/g, replace: "[REDACTED_CARD]" },
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replace: "[REDACTED_EMAIL]" },
  { re: /(?<=password["']?\s*[:=]\s*["']?)[^"'\s]+/gi, replace: "[REDACTED_PASSWORD]" },
];

const SENSITIVE_QUERY =
  /^(token|access_token|refresh_token|id_token|api[_-]?key|key|secret|password|passwd|auth|authorization|credential|code|session|sid|jwt)$/i;

export function redactText(input: string, maxBytes: number): string {
  let out = input;
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  const buf = Buffer.from(out, "utf8");
  if (buf.length > maxBytes) {
    return buf.subarray(0, maxBytes).toString("utf8") + "\n…[truncated]";
  }
  return out;
}

/** Redact credentials in URL query/fragment for audit logs. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY.test(key)) {
        u.searchParams.set(key, "[REDACTED]");
      }
    }
    if (u.hash && /token|key|secret|auth|code/i.test(u.hash)) {
      u.hash = "#REDACTED";
    }
    return u.toString();
  } catch {
    return "[INVALID_URL]";
  }
}
