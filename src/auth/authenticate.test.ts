import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  authenticateOAuthOperator,
  extractApiKeyFromHeaders,
} from "./authenticate.js";
import type { PolicyDocument } from "../types.js";

const policy: PolicyDocument = {
  version: 1,
  environment: "development",
  kill_switch: false,
  rate_limit_per_min: 60,
  principals: [
    {
      id: "local-dev",
      api_key: "test-secret-key-aaaaaaaa",
      roles: ["operator"],
      allow_hosts: ["localhost"],
      capabilities: ["http.request"],
      allow_methods: ["GET"],
      write: false,
      max_response_bytes: 1024,
    },
    {
      id: "oauth-operator",
      api_key: "operator-secret-key-bbbbbbbb",
      roles: ["oauth_operator"],
      allow_hosts: [],
      capabilities: [],
      allow_methods: ["GET"],
      write: false,
      oauth_operator: true,
      max_response_bytes: 1024,
    },
  ],
  deny_hosts: [],
  ssrf: {
    block_private: true,
    block_loopback: false,
    block_link_local: true,
    block_metadata: true,
  },
};

describe("extractApiKeyFromHeaders", () => {
  it("reads Bearer token", () => {
    assert.equal(
      extractApiKeyFromHeaders({ authorization: "Bearer abc123" }),
      "abc123"
    );
  });

  it("reads X-API-Key", () => {
    assert.equal(
      extractApiKeyFromHeaders({ "x-api-key": "key-from-header" }),
      "key-from-header"
    );
  });
});

describe("authenticate fail-closed", () => {
  it("accepts matching key (strict)", () => {
    const p = authenticate(policy, "test-secret-key-aaaaaaaa", { strict: true });
    assert.equal(p.id, "local-dev");
  });

  it("rejects missing key (strict)", () => {
    assert.throws(() => authenticate(policy, undefined, { strict: true }));
  });

  it("rejects wrong key (strict)", () => {
    assert.throws(() => authenticate(policy, "wrong", { strict: true }));
  });

  it("rejects missing key on stdio path (no soft allow)", () => {
    const prev = process.env.MCP_API_KEY;
    delete process.env.MCP_API_KEY;
    try {
      assert.throws(() => authenticate(policy));
    } finally {
      if (prev !== undefined) process.env.MCP_API_KEY = prev;
    }
  });

  it("stdio uses env MCP_API_KEY", () => {
    const prev = process.env.MCP_API_KEY;
    process.env.MCP_API_KEY = "test-secret-key-aaaaaaaa";
    try {
      assert.equal(authenticate(policy).id, "local-dev");
    } finally {
      if (prev === undefined) delete process.env.MCP_API_KEY;
      else process.env.MCP_API_KEY = prev;
    }
  });
});

describe("authenticateOAuthOperator", () => {
  it("accepts operator principal key", () => {
    const p = authenticateOAuthOperator(policy, "operator-secret-key-bbbbbbbb");
    assert.equal(p.id, "oauth-operator");
  });

  it("rejects non-operator key", () => {
    assert.throws(() =>
      authenticateOAuthOperator(policy, "test-secret-key-aaaaaaaa")
    );
  });
});
