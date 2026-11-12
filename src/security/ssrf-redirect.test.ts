import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSafeUrl } from "./ssrf.js";
import { explainHost } from "../policy/engine.js";
import type { AuthContext, PolicyDocument } from "../types.js";

const policy: PolicyDocument = {
  version: 1,
  kill_switch: false,
  rate_limit_per_min: 60,
  principals: [],
  deny_hosts: ["metadata.google.internal"],
  ssrf: {
    block_private: true,
    block_loopback: true,
    block_link_local: true,
    block_metadata: true,
  },
};

const ctx: AuthContext = {
  principal: {
    id: "r",
    roles: [],
    allow_hosts: ["example.com"],
    capabilities: ["page.navigate"],
    allow_methods: ["GET"],
    write: false,
    max_response_bytes: 1024,
  },
  sessionId: "s",
};

/** Mirrors gateway final-URL gate used after Playwright redirects. */
async function gateFinalUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol === "about:") {
    throw new Error("about: URLs not allowed as navigation target");
  }
  const hostDec = explainHost(ctx, parsed.hostname, policy);
  if (!hostDec.allow) throw new Error(hostDec.reason);
  const ssrf = await assertSafeUrl(url, policy.ssrf, policy.deny_hosts);
  if (!ssrf.ok) throw new Error(ssrf.reason || "SSRF blocked");
}

describe("navigation redirect restrictions", () => {
  it("allows final host when on allowlist (policy gate)", () => {
    assert.equal(explainHost(ctx, "example.com", policy).allow, true);
  });

  it("blocks final URL off allowlist (open redirect pivot)", async () => {
    await assert.rejects(
      () => gateFinalUrl("https://evil.example/phish"),
      /not in allow_hosts/
    );
  });

  it("blocks metadata final URL via SSRF", async () => {
    await assert.rejects(() =>
      gateFinalUrl("http://169.254.169.254/latest/meta-data/")
    );
  });

  it("blocks about:blank final URL", async () => {
    await assert.rejects(() => gateFinalUrl("about:blank"), /about:/);
  });
});
