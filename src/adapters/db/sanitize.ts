import { redactText } from "../../security/redact.js";

const DEFAULT_REDACT = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "private_key",
  "ssn",
  "credit_card",
  "card_number",
]);

export function redactRows(
  rows: Record<string, unknown>[],
  extraColumns: string[] | undefined,
  maxBytes: number
): { rows: Record<string, unknown>[]; truncatedBytes: boolean } {
  const cols = new Set(
    [...DEFAULT_REDACT, ...(extraColumns || []).map((c) => c.toLowerCase())]
  );
  let size = 2;
  const out: Record<string, unknown>[] = [];
  let truncatedBytes = false;

  for (const row of rows) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (cols.has(k.toLowerCase())) {
        clean[k] = "[REDACTED]";
      } else if (typeof v === "string") {
        clean[k] = redactText(v, Math.min(4000, maxBytes));
      } else if (Buffer.isBuffer(v)) {
        clean[k] = "[BINARY]";
      } else {
        clean[k] = v;
      }
    }
    const chunk = Buffer.byteLength(JSON.stringify(clean), "utf8");
    if (size + chunk > maxBytes) {
      truncatedBytes = true;
      break;
    }
    size += chunk + 1;
    out.push(clean);
  }
  return { rows: out, truncatedBytes };
}
