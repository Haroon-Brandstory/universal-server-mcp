import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { loadPolicy } from "../config.js";
import {
  DurableOAuthStore,
  getOAuthStore,
  hashToken,
} from "./oauthStore.js";

const GROK_REDIRECT = "https://grok.com/connectors-oauth-exchange-code/";

function allowedRedirects(): string[] {
  const policy = loadPolicy();
  const fromPolicy = policy.oauth?.allowed_redirect_uris || [];
  const extra = (process.env.MCP_OAUTH_ALLOWED_REDIRECTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([GROK_REDIRECT, ...fromPolicy, ...extra])];
}

function validateRedirectUri(uri: string): void {
  if (!allowedRedirects().includes(uri)) {
    throw new InvalidRequestError(`redirect_uri not allowlisted: ${uri}`);
  }
}

function grokClient(): OAuthClientInformationFull {
  const expected =
    process.env.MCP_OAUTH_GROK_CLIENT_ID || "global-server-mcp-grok";
  return {
    client_id: expected,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: allowedRedirects(),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "Grok Web Connectors",
  };
}

/** Pre-registered clients only — no registerClient ⇒ SDK omits /register. */
export class StaticClientsStore implements OAuthRegisteredClientsStore {
  async getClient(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    const c = grokClient();
    return clientId === c.client_id ? c : undefined;
  }
}

/** Optional DCR — still enforces redirect allowlist. */
export class DcrClientsStore implements OAuthRegisteredClientsStore {
  private dynamic = new Map<string, OAuthClientInformationFull>();

  async getClient(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    const c = grokClient();
    if (clientId === c.client_id) return c;
    return this.dynamic.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    for (const uri of client.redirect_uris || []) {
      validateRedirectUri(uri);
    }
    const client_id = randomUUID();
    const full: OAuthClientInformationFull = {
      ...client,
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: client.token_endpoint_auth_method || "none",
      redirect_uris: (client.redirect_uris || []).filter((u) =>
        allowedRedirects().includes(u)
      ),
    };
    if (!full.redirect_uris.length) {
      throw new InvalidRequestError("No allowlisted redirect_uris");
    }
    this.dynamic.set(client_id, full);
    return full;
  }
}

/**
 * OAuth AS with operator consent + durable hashed token store.
 * authorize() never auto-approves — redirects to /oauth/consent.
 */
export class GatewayOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private store: DurableOAuthStore;

  constructor(store?: DurableOAuthStore) {
    const policy = loadPolicy();
    const allowDcr =
      policy.oauth?.allow_dynamic_registration === true &&
      process.env.MCP_OAUTH_ALLOW_DCR === "1";
    this.clientsStore = allowDcr ? new DcrClientsStore() : new StaticClientsStore();
    this.store = store || getOAuthStore();
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    validateRedirectUri(params.redirectUri);
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError("Unregistered redirect_uri");
    }

    const id = randomUUID();
    this.store.putPending({
      id,
      client,
      params,
      createdAt: Date.now(),
    });

    const pub = (process.env.MCP_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    const consentPath = `/oauth/consent?rid=${encodeURIComponent(id)}`;
    const location = pub ? `${pub}${consentPath}` : consentPath;
    res.redirect(302, location);
  }

  /** Called after operator authenticates and consents. */
  completeConsent(pendingId: string, principalId: string, approve: boolean): {
    redirectUri: string;
  } {
    const pending = this.store.getPending(pendingId);
    if (!pending) throw new Error("Unknown or expired consent request");

    const target = new URL(pending.params.redirectUri);
    if (!approve) {
      this.store.deletePending(pendingId);
      target.searchParams.set("error", "access_denied");
      target.searchParams.set("error_description", "Operator denied consent");
      if (pending.params.state !== undefined) {
        target.searchParams.set("state", pending.params.state);
      }
      return { redirectUri: target.toString() };
    }

    const policy = loadPolicy();
    const principal = policy.principals.find((p) => p.id === principalId);
    if (!principal?.oauth_allowed) {
      throw new Error(`Principal not oauth_allowed: ${principalId}`);
    }

    this.store.deletePending(pendingId);

    const code = randomUUID();
    this.store.putCode(code, {
      clientId: pending.client.client_id,
      params: pending.params,
      principalId,
      createdAt: Date.now(),
    });

    target.searchParams.set("code", code);
    if (pending.params.state !== undefined) {
      target.searchParams.set("state", pending.params.state);
    }
    return { redirectUri: target.toString() };
  }

  getPending(pendingId: string) {
    return this.store.getPending(pendingId);
  }

  resolveConsentPrincipalId(clientId: string): string {
    const policy = loadPolicy();
    const mapped = policy.oauth?.client_principal_map?.[clientId];
    const id = mapped || policy.oauth?.default_principal_id;
    if (!id) {
      throw new Error("OAuth default_principal_id not configured in policy");
    }
    const p = policy.principals.find((x) => x.id === id);
    if (!p?.oauth_allowed) {
      throw new Error(`OAuth principal missing or not oauth_allowed: ${id}`);
    }
    return id;
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const data = this.store.getCode(authorizationCode);
    if (!data) throw new Error("Invalid authorization code");
    return data.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const data = this.store.getCode(authorizationCode);
    if (!data) throw new Error("Invalid authorization code");
    if (data.clientId !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }
    this.store.deleteCode(authorizationCode);

    return this.issueTokens(
      client.client_id,
      data.principalId,
      data.params.scopes || ["mcp:tools"],
      data.params.resource
    );
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const existing = this.store.getToken(refreshToken);
    if (!existing || existing.kind !== "refresh" || existing.expiresAt < Date.now()) {
      throw new Error("Invalid refresh token");
    }
    if (existing.clientId !== client.client_id) {
      throw new Error("Refresh token was not issued to this client");
    }

    const nextScopes = scopes?.length ? scopes : existing.scopes;
    return this.issueTokens(
      client.client_id,
      existing.principalId,
      nextScopes,
      resource || (existing.resource ? new URL(existing.resource) : undefined),
      refreshToken
    );
  }

  private issueTokens(
    clientId: string,
    principalId: string,
    scopes: string[],
    resource?: URL,
    existingRefresh?: string
  ): OAuthTokens {
    const access = randomUUID();
    const refresh = existingRefresh || randomUUID();
    const refreshHash = hashToken(refresh);
    const expiresAt = Date.now() + 3600_000;

    this.store.putToken(access, {
      kind: "access",
      clientId,
      principalId,
      scopes,
      expiresAt,
      resource: resource?.href,
      refreshTokenHash: refreshHash,
    });

    if (!existingRefresh) {
      this.store.putToken(refresh, {
        kind: "refresh",
        clientId,
        principalId,
        scopes,
        expiresAt: Date.now() + 30 * 24 * 3600_000,
        resource: resource?.href,
      });
    }

    return {
      access_token: access,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refresh,
      scope: scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const data = this.store.getToken(token);
    if (!data || data.kind !== "access" || data.expiresAt < Date.now()) {
      throw new Error("Invalid or expired token");
    }
    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      expiresAt: Math.floor(data.expiresAt / 1000),
      resource: data.resource ? new URL(data.resource) : undefined,
      extra: { principalId: data.principalId },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string }
  ): Promise<void> {
    this.store.revoke(request.token);
  }
}

let singleton: GatewayOAuthProvider | null = null;

export function getOAuthProvider(): GatewayOAuthProvider {
  if (!singleton) singleton = new GatewayOAuthProvider();
  return singleton;
}

export function resetOAuthProviderForTests(
  store?: DurableOAuthStore
): GatewayOAuthProvider {
  singleton = new GatewayOAuthProvider(store);
  return singleton;
}

export function grokOAuthClientId(): string {
  return process.env.MCP_OAUTH_GROK_CLIENT_ID || "global-server-mcp-grok";
}
