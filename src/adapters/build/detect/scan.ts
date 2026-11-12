import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { DetectContext } from "../types.js";

const SKIP = new Set([
  "node_modules",
  ".git",
  "vendor",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

export function buildDetectContext(root: string, maxFiles = 400): DetectContext {
  const absRoot = root;
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new Error(`Build workspace root not found: ${root}`);
  }

  const files = new Set<string>();

  function walk(dir: string): void {
    if (files.size >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (files.size >= maxFiles) return;
      if (SKIP.has(ent.name) || ent.name.startsWith(".env")) continue;
      const full = join(dir, ent.name);
      const rel = relative(absRoot, full).split("\\").join("/");
      if (ent.isDirectory()) {
        files.add(rel + "/");
        walk(full);
      } else if (ent.isFile()) {
        files.add(rel);
      }
    }
  }

  walk(absRoot);

  return {
    root: absRoot,
    files,
    readText(relPath, maxBytes = 64_000) {
      const full = join(absRoot, relPath);
      if (!existsSync(full) || !statSync(full).isFile()) return null;
      try {
        const buf = readFileSync(full);
        return buf.subarray(0, maxBytes).toString("utf8");
      } catch {
        return null;
      }
    },
    readJson<T = unknown>(relPath: string): T | null {
      const text = this.readText(relPath);
      if (!text) return null;
      try {
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    },
  };
}

export function hasFile(ctx: DetectContext, name: string): boolean {
  return ctx.files.has(name);
}

export function hasAny(ctx: DetectContext, names: string[]): boolean {
  return names.some((n) => ctx.files.has(n));
}
