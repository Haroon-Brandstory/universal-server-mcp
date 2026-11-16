import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetOAuthStoreForTests } from "./oauthStore.js";
import {
  isRedirectAllowed,
  resetOAuthProviderForTests,
  StaticClientsStore,
} from "./oauthProvider.js";

const GROK_REDIRECT = "https://grok.com/connectors-oauth-exchange-code/";
const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CHATGPT_REDIRECT =
  "https://chatgpt.com/connector_platform_oauth_redirect";
const CHATGPT_DYNAMIC =
  "https://chatgpt.com/connector/oauth/abc123-test-callback";

describe("OAuth security", () => {
  let provider: ReturnType<typeof resetOAuthProviderForTests>;

  before(() => {
    const dir = mkdtempSync(join(tmpdir(), "oauth-test-"));
    const policyPath = join(dir, "policy.yaml");
    writeFileSync(
      policyPath,
      `
version: 1
environment: development
kill_switch: false
rate_limit_per_min: 60
oauth:
  allowed_redirect_uris:
    - ${GROK_REDIRECT}
    - ${CLAUDE_REDIRECT}
    - ${CHATGPT_REDIRECT}
  allowed_redirect_uri_prefixes:
    - https://chatgpt.com/connector/oauth/
  default_principal_id: oauth-remote
  client_principal_map:
    global-server-mcp-grok: oauth-remote
    global-server-mcp-claude: oauth-remote
    global-server-mcp-chatgpt: oauth-remote
    global-server-mcp-cursor: oauth-remote
  allow_dynamic_registration: false
principals:
  - id: oauth-remote
    roles: [remote]
    allow_hosts: [localhost]
    capabilities: [policy.explain]
    allow_methods: [GET]
    write: false
    admin: false
    oauth_allowed: true
    max_response_bytes: 1024
  - id: local-dev
    api_key: unused
    roles: [operator]
    allow_hosts: [localhost]
    capabilities: [code.write]
    allow_methods: [GET]
    write: true
    admin: true
    oauth_allowed: false
    max_response_bytes: 1024
deny_hosts: []
ssrf:
  block_private: true
  block_loopback: false
  block_link_local: true
  block_metadata: true
`
    );
    process.env.MCP_POLICY_PATH = policyPath;
    const store = resetOAuthStoreForTests(join(dir, "oauth-store.json"));
    provider = resetOAuthProviderForTests(store);
  });

  it("StaticClientsStore has no registerClient", () => {
    const store = new StaticClientsStore();
    assert.equal(
      typeof (store as { registerClient?: unknown }).registerClient,
      "undefined"
    );
  });

  it("consent required — completeConsent binds oauth-remote not local-dev", async () => {
    const client = await provider.clientsStore.getClient("global-server-mcp-grok");
    assert.ok(client);

    const redirects: string[] = [];
    const res = {
      redirect: (_code: number, loc: string) => {
        redirects.push(loc);
      },
    } as unknown as import("express").Response;

    await provider.authorize(
      client!,
      {
        codeChallenge: "challenge",
        redirectUri: GROK_REDIRECT,
        scopes: ["mcp:tools"],
        state: "xyz",
      },
      res
    );
    assert.equal(redirects.length, 1);
    assert.ok(redirects[0].includes("/oauth/consent?rid="));
    const rid = new URL(redirects[0], "http://localhost").searchParams.get("rid");
    assert.ok(rid);

    // deny privileged principal — pending must remain for retry
    assert.throws(() => provider.completeConsent(rid!, "local-dev", true));

    const { redirectUri } = provider.completeConsent(rid!, "oauth-remote", true);
    const code = new URL(redirectUri).searchParams.get("code");
    assert.ok(code);

    const tokens = await provider.exchangeAuthorizationCode(client!, code!);
    const info = await provider.verifyAccessToken(tokens.access_token);
    assert.equal(info.extra?.principalId, "oauth-remote");

    await provider.revokeToken(client!, { token: tokens.access_token });
    await assert.rejects(() => provider.verifyAccessToken(tokens.access_token));
  });

  it("rejects non-allowlisted redirect", async () => {
    const client = await provider.clientsStore.getClient("global-server-mcp-grok");
    const res = {
      redirect: () => undefined,
    } as unknown as import("express").Response;
    await assert.rejects(() =>
      provider.authorize(
        client!,
        {
          codeChallenge: "x",
          redirectUri: "https://evil.example/cb",
        },
        res
      )
    );
  });

  it("claude client — consent + token bind oauth-remote", async () => {
    const client = await provider.clientsStore.getClient(
      "global-server-mcp-claude"
    );
    assert.ok(client);
    assert.ok(client!.redirect_uris.includes(CLAUDE_REDIRECT));

    const redirects: string[] = [];
    const res = {
      redirect: (_code: number, loc: string) => {
        redirects.push(loc);
      },
    } as unknown as import("express").Response;

    await provider.authorize(
      client!,
      {
        codeChallenge: "challenge-claude",
        redirectUri: CLAUDE_REDIRECT,
        scopes: ["mcp:tools"],
        state: "claude-state",
      },
      res
    );
    const rid = new URL(redirects[0], "http://localhost").searchParams.get(
      "rid"
    );
    assert.ok(rid);

    const { redirectUri } = provider.completeConsent(rid!, "oauth-remote", true);
    assert.equal(
      new URL(redirectUri).origin + new URL(redirectUri).pathname,
      CLAUDE_REDIRECT
    );
    const code = new URL(redirectUri).searchParams.get("code");
    assert.ok(code);

    const tokens = await provider.exchangeAuthorizationCode(client!, code!);
    const info = await provider.verifyAccessToken(tokens.access_token);
    assert.equal(info.extra?.principalId, "oauth-remote");
    assert.equal(
      provider.resolveConsentPrincipalId("global-server-mcp-claude"),
      "oauth-remote"
    );
  });

  it("rejects grok client using claude redirect", async () => {
    const client = await provider.clientsStore.getClient("global-server-mcp-grok");
    const res = {
      redirect: () => undefined,
    } as unknown as import("express").Response;
    await assert.rejects(() =>
      provider.authorize(
        client!,
        {
          codeChallenge: "x",
          redirectUri: CLAUDE_REDIRECT,
        },
        res
      )
    );
  });

  it("chatgpt client — platform + dynamic prefix redirects", async () => {
    assert.equal(isRedirectAllowed(CHATGPT_REDIRECT), true);
    assert.equal(isRedirectAllowed(CHATGPT_DYNAMIC), true);
    assert.equal(isRedirectAllowed("https://evil.example/oauth/x"), false);
    assert.equal(
      isRedirectAllowed("https://chatgpt.com/connector/oauth/"),
      false
    );

    const client = await provider.clientsStore.getClient(
      "global-server-mcp-chatgpt"
    );
    assert.ok(client);

    const redirects: string[] = [];
    const res = {
      redirect: (_code: number, loc: string) => {
        redirects.push(loc);
      },
    } as unknown as import("express").Response;

    await provider.authorize(
      client!,
      {
        codeChallenge: "challenge-chatgpt",
        redirectUri: CHATGPT_DYNAMIC,
        scopes: ["mcp:tools"],
      },
      res
    );
    const rid = new URL(redirects[0], "http://localhost").searchParams.get(
      "rid"
    );
    const { redirectUri } = provider.completeConsent(rid!, "oauth-remote", true);
    assert.ok(redirectUri.startsWith(CHATGPT_DYNAMIC));
    assert.equal(
      provider.resolveConsentPrincipalId("global-server-mcp-chatgpt"),
      "oauth-remote"
    );
  });

  it("cursor + chatgpt static clients exist", async () => {
    assert.ok(
      await provider.clientsStore.getClient("global-server-mcp-cursor")
    );
    assert.ok(
      await provider.clientsStore.getClient("global-server-mcp-chatgpt")
    );
  });

  it("bad refresh token throws InvalidGrantError (SDK → 400 not 500)", async () => {
    const { InvalidGrantError } = await import(
      "@modelcontextprotocol/sdk/server/auth/errors.js"
    );
    const client = await provider.clientsStore.getClient("global-server-mcp-grok");
    await assert.rejects(
      () => provider.exchangeRefreshToken(client!, "not-a-real-refresh"),
      (err: unknown) => err instanceof InvalidGrantError
    );
  });
});
