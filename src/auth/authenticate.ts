import { timingSafeEqual } from "node:crypto";
import type { PolicyDocument, Principal } from "../types.js";
import { effectivePrincipal } from "../policy/resolvePrincipal.js";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function resolveKey(p: Principal): string | undefined {
  if (p.api_key) return p.api_key;
  if (p.api_key_env) return process.env[p.api_key_env];
  return undefined;
}

export function extractApiKeyFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const auth = headers["authorization"] ?? headers["Authorization"];
  const authVal = Array.isArray(auth) ? auth[0] : auth;
  if (authVal?.toLowerCase().startsWith("bearer ")) {
    const token = authVal.slice(7).trim();
    if (token) return token;
  }
  const xKey = headers["x-api-key"] ?? headers["X-API-Key"];
  const xVal = Array.isArray(xKey) ? xKey[0] : xKey;
  if (xVal?.trim()) return xVal.trim();
  return undefined;
}

/**
 * Authenticate caller against policy principals.
 * Fail-closed: missing/wrong key always denies (stdio and HTTP).
 * Stdio reads MCP_API_KEY from env when providedKey omitted.
 */
export function authenticate(
  policy: PolicyDocument,
  providedKey?: string,
  opts?: { strict?: boolean }
): Principal {
  const key =
    providedKey ??
    (opts?.strict === true ? undefined : process.env.MCP_API_KEY);

  if (!key) {
    throw new Error("Authentication failed: invalid or missing API key");
  }

  for (const p of policy.principals) {
    const expected = resolveKey(p);
    if (expected && safeEqual(expected, key)) {
      const revoked = policy.platform?.revoked_principal_ids || [];
      if (revoked.includes(p.id)) {
        throw new Error(`Authentication failed: principal revoked (${p.id})`);
      }
      return effectivePrincipal(policy, p);
    }
  }

  throw new Error("Authentication failed: invalid or missing API key");
}

/** Authenticate OAuth consent operator (oauth_operator principals only). */
export function authenticateOAuthOperator(
  policy: PolicyDocument,
  providedKey: string | undefined
): Principal {
  if (!providedKey) {
    throw new Error("Authentication failed: operator key required");
  }
  for (const p of policy.principals) {
    if (!p.oauth_operator) continue;
    const expected = resolveKey(p);
    if (expected && safeEqual(expected, providedKey)) {
      return effectivePrincipal(policy, p);
    }
  }
  // Also accept MCP_OAUTH_OPERATOR_KEY env as dedicated operator secret
  const envOp = process.env.MCP_OAUTH_OPERATOR_KEY;
  if (envOp && safeEqual(envOp, providedKey)) {
    const op = policy.principals.find((p) => p.oauth_operator);
    if (op) return effectivePrincipal(policy, op);
  }
  throw new Error("Authentication failed: invalid operator key");
}
