import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { MigrationFile } from "./types.js";

export function loadMigrationFiles(migrationsPath: string): MigrationFile[] {
  const root = resolve(process.cwd(), migrationsPath);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Migrations path missing: ${root}`);
  }
  const files = readdirSync(root)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((filename) => {
    const full = join(root, filename);
    const body = readFileSync(full);
    return {
      id: basename(filename, ".sql"),
      filename,
      checksum: createHash("sha256").update(body).digest("hex"),
      bytes: body.length,
    };
  });
}

export function readMigrationSql(
  migrationsPath: string,
  migrationId: string
): { filename: string; sql: string; checksum: string } {
  const files = loadMigrationFiles(migrationsPath);
  const hit = files.find(
    (f) => f.id === migrationId || f.filename === migrationId
  );
  if (!hit) {
    throw new Error(`Migration not found: ${migrationId}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(hit.filename)) {
    throw new Error(`Unsafe migration filename: ${hit.filename}`);
  }
  const full = join(resolve(process.cwd(), migrationsPath), hit.filename);
  const sql = readFileSync(full, "utf8");
  return { filename: hit.filename, sql, checksum: hit.checksum };
}

export function validateMigrationSql(sql: string): {
  ok: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!sql.trim()) {
    return { ok: false, warnings: ["empty SQL"] };
  }
  if (/\bDROP\s+DATABASE\b/i.test(sql)) {
    return { ok: false, warnings: ["DROP DATABASE forbidden"] };
  }
  if (/\bTRUNCATE\b/i.test(sql)) {
    warnings.push("TRUNCATE detected — destructive");
  }
  if (/\bDROP\s+TABLE\b/i.test(sql)) {
    warnings.push("DROP TABLE detected — destructive");
  }
  return { ok: true, warnings };
}
