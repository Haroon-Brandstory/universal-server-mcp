import { redactText } from "../../security/redact.js";

export interface HttpRequestInput {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  maxResponseBytes: number;
  timeoutMs?: number;
}

export interface HttpRequestResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const BLOCKED_REQUEST_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
]);

export async function httpRequest(input: HttpRequestInput): Promise<HttpRequestResult> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers || {})) {
    if (BLOCKED_REQUEST_HEADERS.has(k.toLowerCase())) continue;
    headers[k] = v;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);

  try {
    const res = await fetch(input.url, {
      method: input.method.toUpperCase(),
      headers,
      body: ["GET", "HEAD"].includes(input.method.toUpperCase()) ? undefined : input.body,
      redirect: "manual",
      signal: controller.signal,
    });

    const rawHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (["set-cookie", "authorization", "cookie"].includes(k.toLowerCase())) {
        rawHeaders[k] = "[REDACTED]";
      } else {
        rawHeaders[k] = v;
      }
    });

    const text = await res.text();
    return {
      status: res.status,
      headers: rawHeaders,
      body: redactText(text, input.maxResponseBytes),
    };
  } finally {
    clearTimeout(t);
  }
}
