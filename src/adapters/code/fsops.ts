import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative } from "node:path";
import { resolveUnderAllowPaths } from "./paths.js";

const MAX_WRITE_BYTES = 512_000;

export function listDir(
  allowPaths: string[],
  path: string,
  maxEntries = 200
): { path: string; entries: { name: string; type: string; size?: number }[] } {
  const { abs } = resolveUnderAllowPaths(allowPaths, path);
  const st = statSync(abs);
  if (!st.isDirectory()) throw new Error("Not a directory");
  const names = readdirSync(abs).slice(0, maxEntries);
  const entries = names.map((name) => {
    try {
      const s = statSync(join(abs, name));
      return {
        name,
        type: s.isDirectory() ? "dir" : "file",
        size: s.isFile() ? s.size : undefined,
      };
    } catch {
      return { name, type: "unknown" };
    }
  });
  return { path: abs, entries };
}

export function readFile(
  allowPaths: string[],
  path: string,
  maxBytes: number
): { path: string; content: string; truncated: boolean; bytes: number } {
  const { abs } = resolveUnderAllowPaths(allowPaths, path);
  const st = statSync(abs);
  if (!st.isFile()) throw new Error("Not a file");
  const buf = readFileSync(abs);
  const truncated = buf.length > maxBytes;
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return {
    path: abs,
    content: slice.toString("utf8"),
    truncated,
    bytes: buf.length,
  };
}

export function writeFile(
  allowPaths: string[],
  path: string,
  content: string
): { path: string; bytes: number } {
  const { abs } = resolveUnderAllowPaths(allowPaths, path);
  const buf = Buffer.from(content, "utf8");
  if (buf.length > MAX_WRITE_BYTES) {
    throw new Error(`File too large to write (max ${MAX_WRITE_BYTES} bytes)`);
  }
  if (existsSync(abs) && !statSync(abs).isFile()) {
    throw new Error("Target exists and is not a file");
  }
  writeFileSync(abs, buf, { encoding: "utf8" });
  return { path: abs, bytes: buf.length };
}

export function editFile(
  allowPaths: string[],
  path: string,
  oldString: string,
  newString: string,
  replaceAll = false
): { path: string; replacements: number } {
  if (!oldString) throw new Error("oldString required");
  const { abs } = resolveUnderAllowPaths(allowPaths, path);
  const before = readFileSync(abs, "utf8");
  if (!before.includes(oldString)) {
    throw new Error("oldString not found in file");
  }
  let replacements = 0;
  let after: string;
  if (replaceAll) {
    const parts = before.split(oldString);
    replacements = parts.length - 1;
    after = parts.join(newString);
  } else {
    replacements = 1;
    after = before.replace(oldString, newString);
  }
  const buf = Buffer.from(after, "utf8");
  if (buf.length > MAX_WRITE_BYTES) {
    throw new Error(`File too large after edit (max ${MAX_WRITE_BYTES} bytes)`);
  }
  writeFileSync(abs, buf, { encoding: "utf8" });
  return { path: abs, replacements };
}

export function searchFiles(
  allowPaths: string[],
  rootPath: string,
  query: string,
  maxHits = 50
): { hits: { path: string; line: number; text: string }[] } {
  if (!query || query.length < 2) throw new Error("query too short");
  const { abs, root } = resolveUnderAllowPaths(allowPaths, rootPath);
  const hits: { path: string; line: number; text: string }[] = [];

  function walk(dir: string): void {
    if (hits.length >= maxHits) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (hits.length >= maxHits) return;
      if (
        ent.name === "node_modules" ||
        ent.name === ".git" ||
        ent.name === "dist" ||
        ent.name === ".next" ||
        ent.name === "build"
      ) {
        continue;
      }
      const full = join(dir, ent.name);
      try {
        resolveUnderAllowPaths(allowPaths, full);
      } catch {
        continue;
      }
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        if (ent.name.startsWith(".env")) continue;
        let text: string;
        try {
          const st = statSync(full);
          if (st.size > 200_000) continue;
          text = readFileSync(full, "utf8");
        } catch {
          continue;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (hits.length >= maxHits) return;
          if (lines[i].includes(query)) {
            hits.push({
              path: relative(root, full) || full,
              line: i + 1,
              text: lines[i].slice(0, 240),
            });
          }
        }
      }
    }
  }

  const st = statSync(abs);
  if (st.isDirectory()) walk(abs);
  else {
    const text = readFileSync(abs, "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      if (hits.length < maxHits && line.includes(query)) {
        hits.push({ path: relative(root, abs) || abs, line: i + 1, text: line.slice(0, 240) });
      }
    });
  }

  return { hits };
}
