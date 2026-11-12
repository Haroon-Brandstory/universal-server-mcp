import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactUrl, redactText } from "./redact.js";

describe("redactUrl", () => {
  it("redacts sensitive query params", () => {
    const out = redactUrl(
      "https://example.com/cb?code=secretcode&state=ok&api_key=abc12345"
    );
    assert.ok(out.includes("code=%5BREDACTED%5D") || out.includes("code=[REDACTED]"));
    assert.ok(out.includes("state=ok"));
    assert.ok(!out.includes("secretcode"));
    assert.ok(!out.includes("abc12345"));
  });

  it("handles invalid url", () => {
    assert.equal(redactUrl("not a url"), "[INVALID_URL]");
  });
});

describe("redactText", () => {
  it("redacts bearer tokens", () => {
    const out = redactText("Authorization: Bearer abcdefghijklmnop", 10_000);
    assert.ok(out.includes("[REDACTED_TOKEN]"));
  });
});
