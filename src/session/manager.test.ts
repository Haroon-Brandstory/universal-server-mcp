import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionManager, type BrowserSession } from "./manager.js";

function fakeSession(id: string, principalId: string): BrowserSession {
  return {
    id,
    principalId,
    browser: { close: async () => undefined } as BrowserSession["browser"],
    page: {} as BrowserSession["page"],
    createdAt: Date.now(),
  };
}

describe("SessionManager principal isolation", () => {
  it("allows owner access", () => {
    const sm = new SessionManager();
    sm._registerForTests(fakeSession("s1", "alice"));
    const s = sm.get("s1", "alice");
    assert.equal(s.principalId, "alice");
  });

  it("rejects cross-principal get", () => {
    const sm = new SessionManager();
    sm._registerForTests(fakeSession("s1", "alice"));
    assert.throws(
      () => sm.get("s1", "bob"),
      /principal mismatch/
    );
  });

  it("rejects cross-principal close", async () => {
    const sm = new SessionManager();
    sm._registerForTests(fakeSession("s1", "alice"));
    await assert.rejects(
      () => sm.close("s1", "bob"),
      /principal mismatch/
    );
    // still present for owner
    assert.equal(sm.get("s1", "alice").id, "s1");
  });

  it("owner can close", async () => {
    const sm = new SessionManager();
    sm._registerForTests(fakeSession("s1", "alice"));
    await sm.close("s1", "alice");
    assert.throws(() => sm.get("s1", "alice"));
  });
});
