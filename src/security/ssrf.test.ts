import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSafeUrl } from "./ssrf.js";

const cfg = {
  block_private: true,
  block_loopback: true,
  block_link_local: true,
  block_metadata: true,
};

describe("ssrf guard", () => {
  it("blocks metadata IP", async () => {
    const r = await assertSafeUrl("http://169.254.169.254/latest", cfg, []);
    assert.equal(r.ok, false);
  });

  it("blocks non-http schemes", async () => {
    const r = await assertSafeUrl("file:///etc/passwd", cfg, []);
    assert.equal(r.ok, false);
  });

  it("allows literal public IPv4 when not otherwise blocked", async () => {
    const r = await assertSafeUrl("https://8.8.8.8/", cfg, []);
    assert.equal(r.ok, true);
  });

  it("allows public Cloudflare IPv6 (not false-private)", async () => {
    const r = await assertSafeUrl("https://[2606:4700::6810:e684]/", cfg, []);
    assert.equal(r.ok, true, r.reason);
  });

  it("allows public AWS-like IPv6 (not false-private)", async () => {
    const r = await assertSafeUrl(
      "https://[2600:1f1c:d8:5f00:bb60:3b1d:7b34:46b3]/",
      cfg,
      []
    );
    assert.equal(r.ok, true, r.reason);
  });

  it("still blocks IPv6 ULA", async () => {
    const r = await assertSafeUrl("https://[fd12:3456:789a::1]/", cfg, []);
    assert.equal(r.ok, false);
  });
});
