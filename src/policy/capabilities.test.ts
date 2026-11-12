import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toolsForPrincipal } from "./capabilities.js";
import {
  explainCapability,
  explainMethod,
} from "./engine.js";
import { effectivePrincipal } from "./resolvePrincipal.js";
import type { AuthContext, PolicyDocument, Principal } from "../types.js";

const basePolicy: PolicyDocument = {
  version: 1,
  environment: "development",
  kill_switch: false,
  rate_limit_per_min: 60,
  projects: [
    {
      id: "app",
      allow_hosts: ["example.com"],
      allow_paths: ["/tmp/app"],
    },
  ],
  principals: [],
  deny_hosts: [],
  ssrf: {
    block_private: true,
    block_loopback: true,
    block_link_local: true,
    block_metadata: true,
  },
};

function principal(partial: Partial<Principal> & { id: string }): Principal {
  return {
    roles: [],
    allow_hosts: [],
    capabilities: [],
    allow_methods: ["GET"],
    write: false,
    max_response_bytes: 1024,
    ...partial,
  };
}

describe("toolsForPrincipal", () => {
  it("filters by capabilities", () => {
    const p = principal({
      id: "r",
      capabilities: ["code.read", "code.list"],
    });
    const names = toolsForPrincipal(p).map((t) => t.name).sort();
    assert.deepEqual(names, ["code.list", "code.read"]);
  });

  it("hides write tools when write=false even if listed", () => {
    const p = principal({
      id: "r",
      capabilities: ["code.read", "code.write", "code.edit"],
      write: false,
    });
    const names = toolsForPrincipal(p).map((t) => t.name);
    assert.ok(names.includes("code.read"));
    assert.ok(!names.includes("code.write"));
    assert.ok(!names.includes("code.edit"));
  });

  it("hides admin tools when admin=false", () => {
    const p = principal({
      id: "r",
      capabilities: ["policy.explain", "audit.tail"],
      admin: false,
    });
    const names = toolsForPrincipal(p).map((t) => t.name);
    assert.ok(names.includes("policy.explain"));
    assert.ok(!names.includes("audit.tail"));
  });
});

describe("read/write/admin enforcement", () => {
  it("blocks write capability without write flag", () => {
    const ctx: AuthContext = {
      principal: principal({
        id: "r",
        capabilities: ["code.write"],
        write: false,
      }),
      sessionId: "s",
    };
    const d = explainCapability(ctx, "code.write", basePolicy);
    assert.equal(d.allow, false);
  });

  it("allows write capability with write flag", () => {
    const ctx: AuthContext = {
      principal: principal({
        id: "r",
        capabilities: ["code.write"],
        write: true,
      }),
      sessionId: "s",
    };
    assert.equal(explainCapability(ctx, "code.write", basePolicy).allow, true);
  });

  it("blocks unsafe HTTP methods when write=false", () => {
    const ctx: AuthContext = {
      principal: principal({
        id: "r",
        capabilities: ["http.request"],
        allow_methods: ["GET", "POST"],
        write: false,
      }),
      sessionId: "s",
    };
    assert.equal(explainMethod(ctx, "POST").allow, false);
    assert.equal(explainMethod(ctx, "GET").allow, true);
  });
});

describe("project scope merge", () => {
  it("merges project hosts, paths, and repos", () => {
    const withRepos: typeof basePolicy = {
      ...basePolicy,
      projects: [
        {
          id: "app",
          allow_hosts: ["example.com"],
          allow_paths: ["/tmp/app"],
          github_repos: ["acme/app"],
        },
      ],
    };
    const p = effectivePrincipal(
      withRepos,
      principal({
        id: "r",
        projects: ["app"],
        allow_hosts: ["localhost"],
        allow_paths: ["/tmp/extra"],
      })
    );
    assert.ok(p.allow_hosts.includes("example.com"));
    assert.ok(p.allow_hosts.includes("localhost"));
    assert.ok(p.allow_paths?.includes("/tmp/app"));
    assert.ok(p.allow_paths?.includes("/tmp/extra"));
    assert.ok(p.allow_repos?.includes("acme/app"));
  });
});
