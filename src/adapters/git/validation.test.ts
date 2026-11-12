import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertBranchName,
  assertFeatureBranch,
  assertNotDeniedCommitTarget,
  parseRepoId,
  sanitizeGitError,
} from "./validation.js";

describe("git validation", () => {
  it("parses owner/name", () => {
    assert.deepEqual(parseRepoId("Acme/App"), {
      owner: "Acme",
      repo: "App",
      full: "Acme/App",
    });
  });

  it("rejects malformed repo ids", () => {
    assert.throws(() => parseRepoId("../etc/passwd"));
    assert.throws(() => parseRepoId("onlyone"));
    assert.throws(() => parseRepoId("a/b/c"));
  });

  it("rejects unsafe branch names", () => {
    assert.throws(() => assertBranchName("-bad"));
    assert.throws(() => assertBranchName("has space"));
    assert.throws(() => assertBranchName("foo..bar"));
  });

  it("enforces feature branch pattern", () => {
    assert.equal(assertFeatureBranch("feat/login"), "feat/login");
    assert.throws(() => assertFeatureBranch("main"));
    assert.throws(() => assertFeatureBranch("random"));
  });

  it("blocks direct commits to deny list", () => {
    assert.throws(() => assertNotDeniedCommitTarget("main"));
    assert.throws(() => assertNotDeniedCommitTarget("production"));
    assertNotDeniedCommitTarget("feat/x");
  });

  it("redacts tokens from errors", () => {
    const e = sanitizeGitError(new Error("fail ghp_ABCDEFG1234567890xyz"));
    assert.ok(!e.message.includes("ghp_"));
    assert.ok(e.message.includes("[REDACTED_TOKEN]"));
  });
});
