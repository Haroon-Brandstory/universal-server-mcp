import type { Request } from "express";
import { loadPolicy } from "../config.js";
import type { Principal } from "../types.js";
import { findPrincipal } from "../policy/resolvePrincipal.js";
import { writeAudit } from "../audit/logger.js";
import { authenticate, extractApiKeyFromHeaders } from "./authenticate.js";
import { getOAuthProvider } from "./oauthProvider.js";

/**
 * Resolve principal for HTTP MCP:
 * 1) static API key → matching principal
 * 2) OAuth access token → explicit principalId from token (oauth_allowed only)
 * Never falls back to privileged local-dev.
 */
export async function resolveHttpPrincipal(req: Request): Promise<Principal> {
  const policy = loadPolicy();
  const bearer = extractApiKeyFromHeaders(
    req.headers as Record<string, string | string[] | undefined>
  );

  if (!bearer) {
    writeAudit({
      ts: new Date().toISOString(),
      sessionId: "http-auth",
      principalId: "anonymous",
      tool: "auth.resolve",
      decision: "deny",
      reason: "missing_credentials",
    });
    throw new Error("Authentication failed: invalid or missing API key");
  }

  try {
    const principal = authenticate(policy, bearer, { strict: true });
    writeAudit({
      ts: new Date().toISOString(),
      sessionId: "http-auth",
      principalId: principal.id,
      tool: "auth.resolve",
      decision: "allow",
      reason: "api_key",
    });
    return principal;
  } catch {
    // not an API key — try OAuth
  }

  try {
    const info = await getOAuthProvider().verifyAccessToken(bearer);
    const principalId = String(info.extra?.principalId || "");
    if (!principalId) {
      throw new Error("OAuth token missing principal binding");
    }
    const principal = findPrincipal(policy, principalId);
    if (!principal) {
      throw new Error(`OAuth principal not found: ${principalId}`);
    }
    if (!principal.oauth_allowed) {
      throw new Error(`OAuth principal not allowed: ${principalId}`);
    }
    writeAudit({
      ts: new Date().toISOString(),
      sessionId: "http-auth",
      principalId: principal.id,
      tool: "auth.resolve",
      decision: "allow",
      reason: "oauth_token",
      meta: { clientId: info.clientId },
    });
    return principal;
  } catch {
    writeAudit({
      ts: new Date().toISOString(),
      sessionId: "http-auth",
      principalId: "anonymous",
      tool: "auth.resolve",
      decision: "deny",
      reason: "invalid_credentials",
    });
    throw new Error("Authentication failed: invalid or missing API key");
  }
}
