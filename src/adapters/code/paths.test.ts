import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveUnderAllowPaths } from "./paths.js";

describe("resolveUnderAllowPaths", () => {
  const root = mkdtempSync(join(tmpdir(), "codeops-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "app.ts"), " consola ");
  writeFileSync(join(root, ".env"), "SECRET=1");

  it("allows file under root", () => {
    const r = resolveUnderAllowPaths([root], join(root, "src", "app.ts"));
    assert.ok(r.abs.endsWith("app.ts"));
  });

  it("blocks escape", () => {
    assert.throws(() =>
      resolveUnderAllowPaths([root], join(root, "..", "outside.ts"))
    );
  });

  it("blocks .env", () => {
    assert.throws(() => resolveUnderAllowPaths([root], join(root, ".env")));
  });

  it("blocks symlink escape when possible", () => {
    const outside = mkdtempSync(join(tmpdir(), "codeops-out-"));
    writeFileSync(join(outside, "secret.txt"), "x");
    const link = join(root, "src", "leak");
    try {
      symlinkSync(join(outside, "secret.txt"), link);
      assert.throws(() => resolveUnderAllowPaths([root], link));
    } catch (err) {
      // some CI/sandbox block symlink create — skip
      if (err instanceof assert.AssertionError) throw err;
    }
  });
});
