import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetOAuthStoreForTests } from "./oauthStore.js";
import {
  resetOAuthProviderForTests,
  StaticClientsStore,
} from "./oauthProvider.js";

const GROK_REDIRECT = "https://grok.com/connectors-oauth-exchange-code/";

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
  default_principal_id: oauth-remote
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
