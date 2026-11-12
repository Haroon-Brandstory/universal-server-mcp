import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authenticate } from "../auth/authenticate.js";
import { CAPABILITY_CLASS, toolsForPrincipal } from "../policy/capabilities.js";
import { TOOL_DEFINITIONS } from "../tools/definitions.js";
import type { PolicyDocument, Principal } from "../types.js";
import { loadPolicy } from "../config.js";
import { listModules } from "./modules.js";
import { platformInfo, platformProjects } from "./operations.js";
import { mergeProjectsIntoPolicy } from "./projectRegistry.js";
import { isRetrySafeTool } from "./retry.js";
import { getMetricsSnapshot, resetMetricsForTests, recordToolMetric } from "./observability.js";

function principal(partial: Partial<Principal> & { id: string }): Principal {
  return {
    roles: [],
    allow_hosts: [],
    capabilities: [],
    allow_methods: ["GET"],
    write: false,
    max_response_bytes: 4096,
    ...partial,
  };
}

describe("platform registry + modules", () => {
  it("lists all GA modules", () => {
    const mods = listModules();
    const ids = mods.map((m) => m.id);
    for (const id of [
      "webops",
      "codeops",
      "gitops",
      "buildops",
      "serverops",
      "databaseops",
      "securityops",
      "deployops",
      "platform",
    ]) {
      assert.ok(ids.includes(id as never), `missing module ${id}`);
    }
  });

  it("merges projects.yaml into policy without dropping allow_paths", () => {
    const policy = loadPolicy();
    assert.ok(policy.projects?.some((p) => p.id === "brandstory-fe"));
    const fe = policy.projects!.find((p) => p.id === "brandstory-fe")!;
    assert.ok(fe.name === "Brandstory Frontend" || fe.allow_paths?.length);
    assert.ok((fe.allow_paths?.length || 0) >= 1);
    assert.ok(fe.stack_profile === "nextjs" || fe.github_repos?.length);
  });

  it("platform.projects filters by principal projects", () => {
    const policy = mergeProjectsIntoPolicy({
      version: 1,
      kill_switch: false,
      rate_limit_per_min: 10,
      principals: [],
      deny_hosts: [],
      ssrf: {
        block_private: true,
        block_loopback: true,
        block_link_local: true,
        block_metadata: true,
      },
      projects: [
        { id: "brandstory-fe", name: "FE" },
        { id: "brandstory-be", name: "BE" },
      ],
      platform: { projects_path: "./config/projects.yaml" },
    });
    const out = platformProjects(
      policy,
      principal({ id: "x", projects: ["brandstory-fe"] })
    );
    assert.ok(out.projects.every((p) => p && p.id === "brandstory-fe"));
  });
});

describe("platform observability + retry", () => {
  it("records metrics", () => {
    resetMetricsForTests();
    recordToolMetric({
      tool: "platform.info",
      decision: "allow",
      durationMs: 3,
      principalId: "p",
      sessionId: "s",
      traceId: "t",
    });
    const snap = getMetricsSnapshot();
    assert.equal(snap.toolAllow, 1);
    assert.ok(snap.byTool["platform.info"]?.allow === 1);
  });

  it("marks read tools retry-safe; write tools not", () => {
    assert.equal(isRetrySafeTool("platform.info"), true);
    assert.equal(isRetrySafeTool("deploy.staging"), false);
    assert.equal(isRetrySafeTool("code.write"), false);
  });
});

describe("integration matrix (protocol-level)", () => {
  it("every Capability has a tool definition and class", () => {
    const names = new Set(TOOL_DEFINITIONS.map((t) => t.name));
    for (const name of Object.keys(CAPABILITY_CLASS)) {
      assert.ok(names.has(name), `capability missing tool def: ${name}`);
    }
  });

  it("tool discovery filters by principal (capability discovery)", () => {
    const p = principal({
      id: "r",
      capabilities: ["platform.info", "deploy.staging"],
      write: false,
    });
    const tools = toolsForPrincipal(p).map((t) => t.name);
    assert.ok(tools.includes("platform.info"));
    assert.ok(!tools.includes("deploy.staging"));
  });

  it("revoked principal cannot authenticate", () => {
    const prev = process.env.MCP_API_KEY;
    process.env.MCP_API_KEY = "test-key-revocation-xyz";
    const policy: PolicyDocument = {
      version: 1,
      kill_switch: false,
      rate_limit_per_min: 10,
      principals: [
        {
          id: "doomed",
          api_key_env: "MCP_API_KEY",
          roles: [],
          allow_hosts: [],
          capabilities: ["platform.info"],
          allow_methods: ["GET"],
          write: false,
          max_response_bytes: 1024,
        },
      ],
      deny_hosts: [],
      ssrf: {
        block_private: true,
        block_loopback: true,
        block_link_local: true,
        block_metadata: true,
      },
      platform: { revoked_principal_ids: ["doomed"] },
    };
    assert.throws(() => authenticate(policy), /revoked/);
    if (prev === undefined) delete process.env.MCP_API_KEY;
    else process.env.MCP_API_KEY = prev;
  });

  it("platform.info exposes honest stack statuses", () => {
    const policy = loadPolicy();
    const info = platformInfo(policy);
    assert.ok(info.modules.length >= 8);
    assert.ok(
      info.stackProfiles.some(
        (s) => s.status === "planned" || s.status === "experimental"
      )
    );
    assert.ok(info.disclaimer.toLowerCase().includes("certified"));
  });

  it("cross-project isolation: empty projects → empty platform.projects", () => {
    const policy = loadPolicy();
    const out = platformProjects(
      policy,
      principal({ id: "none", projects: [] })
    );
    assert.equal(out.projects.length, 0);
  });
});
