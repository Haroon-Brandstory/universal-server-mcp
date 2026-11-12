import { realpathSync, existsSync } from "node:fs";
import { resolve, relative, sep, basename } from "node:path";

const DEFAULT_DENY_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "credentials.json",
  "service-account.json",
  "id_rsa",
  "id_ed25519",
]);

const DEFAULT_DENY_SEGMENTS = [
  "node_modules",
  ".git",
  ".ssh",
  ".aws",
  ".gnupg",
];

export interface PathGateResult {
  abs: string;
  root: string;
}

function isDeniedName(name: string): boolean {
  const lower = name.toLowerCase();
  if (DEFAULT_DENY_NAMES.has(lower)) return true;
  if (lower.startsWith(".env.")) return true;
  if (lower.endsWith(".pem") || lower.endsWith(".key")) return true;
  return false;
}

function hasDeniedSegment(abs: string): boolean {
  return abs.split(sep).some((p) => DEFAULT_DENY_SEGMENTS.includes(p));
}

function underRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`));
}

/**
 * Resolve path under one of allow_paths. Blocks escape, symlinks out, secrets.
 */
export function resolveUnderAllowPaths(
  allowPaths: string[],
  inputPath: string
): PathGateResult {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("path required");
  }
  if (!allowPaths?.length) {
    throw new Error("No allow_paths configured for principal");
  }

  const requested = resolve(inputPath);
  if (hasDeniedSegment(requested) || isDeniedName(basename(requested))) {
    throw new Error(`Path denied by security policy: ${basename(requested)}`);
  }

  const roots = allowPaths.map((root) => {
    const absRoot = resolve(root);
    return existsSync(absRoot) ? realpathSync(absRoot) : absRoot;
  });

  const requestedReal = existsSync(requested)
    ? realpathSync(requested)
    : requested;

  let matchedRoot: string | undefined;
  for (const absRoot of roots) {
    if (underRoot(absRoot, requestedReal) || underRoot(absRoot, requested)) {
      matchedRoot = absRoot;
      break;
    }
  }

  if (!matchedRoot) {
    throw new Error(
      `Path not under allow_paths: ${requested}. Allowed roots: ${allowPaths.join(", ")}`
    );
  }

  let abs = requested;
  if (existsSync(requested)) {
    abs = requestedReal;
    if (!underRoot(matchedRoot, abs)) {
      throw new Error("Symlink escape blocked");
    }
    if (hasDeniedSegment(abs) || isDeniedName(basename(abs))) {
      throw new Error(`Path denied by security policy: ${basename(abs)}`);
    }
  } else {
    const parent = resolve(requested, "..");
    if (!existsSync(parent)) {
      throw new Error(`Parent directory does not exist: ${parent}`);
    }
    const parentReal = realpathSync(parent);
    if (!underRoot(matchedRoot, parentReal)) {
      throw new Error("Parent path escape blocked");
    }
  }

  return { abs, root: matchedRoot };
}
