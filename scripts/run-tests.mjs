#!/usr/bin/env node
/**
 * Expand test files explicitly so CI Node versions without CLI glob
 * support still run the suite (local Node 24 vs Actions Node 20/22).
 */
import { readdirSync, statSync, globSync as fsGlobSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTests(p, out);
    else if (name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

let files;
if (typeof fsGlobSync === "function") {
  files = fsGlobSync("src/**/*.test.ts", { cwd: root }).map((f) => join(root, f));
} else {
  files = walkTests(join(root, "src"));
}
files.sort();

if (files.length === 0) {
  console.error("No test files matched under src/");
  process.exit(1);
}

console.log(`Running ${files.length} test files…`);
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit", cwd: root, env: process.env }
);
process.exit(result.status ?? 1);
