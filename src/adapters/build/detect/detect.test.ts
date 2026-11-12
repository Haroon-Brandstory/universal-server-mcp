import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { detectStack, registerDetector, resetDetectorsForTests } from "./registry.js";
import type { StackDetector } from "../types.js";

const fixtures = join(process.cwd(), "fixtures", "build");

describe("stack detection", () => {
  it("detects node fixture via package.json metadata", () => {
    const { primary } = detectStack(join(fixtures, "node-basic"));
    assert.ok(primary);
    assert.equal(primary!.language, "javascript");
    assert.ok(primary!.suggestedTasks.some((t) => t.id === "node.file.test"));
  });

  it("detects python fixture", () => {
    const { primary } = detectStack(join(fixtures, "python-basic"));
    assert.ok(primary);
    assert.equal(primary!.language, "python");
    assert.ok(primary!.suggestedTasks.some((t) => t.id === "python.file.test"));
  });

  it("detects php fixture via composer + index.php", () => {
    const { primary } = detectStack(join(fixtures, "php-basic"));
    assert.ok(primary);
    assert.equal(primary!.language, "php");
    assert.ok(primary!.suggestedTasks.some((t) => t.id === "php.lint"));
  });

  it("allows extensible detectors without gateway changes", () => {
    resetDetectorsForTests();
    const custom: StackDetector = {
      id: "custom-marker",
      detect(ctx) {
        if (![...ctx.files].some((f) => f.endsWith(".customproj"))) return null;
        return {
          language: "custom",
          confidence: 1,
          evidence: [{ file: "x.customproj", detail: "custom" }],
          suggestedTasks: [],
          detectorId: "custom-marker",
        };
      },
    };
    registerDetector(custom);
    // no .customproj in fixtures → null from custom; builtins still work
    const { primary } = detectStack(join(fixtures, "node-basic"));
    assert.equal(primary!.detectorId, "node-family");
    resetDetectorsForTests();
  });
});
