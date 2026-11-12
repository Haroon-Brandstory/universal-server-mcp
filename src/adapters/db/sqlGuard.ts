/**
 * Defense-in-depth SQL checks for db.query.read.
 * Primary control remains read-only DB credentials + driver READ ONLY txn.
 */

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|EXECUTE|EXEC|MERGE|REPLACE|LOAD|INTO\s+OUTFILE|INTO\s+DUMPFILE|SET\s+ROLE|SET\s+SESSION\s+AUTHORIZATION)\b/i;

export function assertReadOnlySql(sql: string, maxChars: number): string {
  const s = String(sql || "").trim();
  if (!s) throw new Error("SQL required");
  if (s.length > maxChars) {
    throw new Error(`SQL exceeds max_sql_chars (${maxChars})`);
  }
  if (s.includes(";") && s.replace(/;+\s*$/, "").includes(";")) {
    throw new Error("Multiple SQL statements forbidden");
  }
  const cleaned = s.replace(/;+\s*$/, "");
  if (FORBIDDEN.test(cleaned)) {
    throw new Error("Write/DDL keywords forbidden in db.query.read");
  }
  // Must start with SELECT or WITH (CTE read)
  if (!/^\s*(WITH|SELECT)\b/i.test(cleaned)) {
    throw new Error("db.query.read allows SELECT/WITH only");
  }
  // Block SELECT INTO
  if (/\bINTO\b/i.test(cleaned) && !/\bINTO\s+TEMP\b/i.test(cleaned)) {
    // allow "INSERT" already blocked; SELECT INTO is write-ish
    if (/\bSELECT\b[\s\S]*\bINTO\b/i.test(cleaned)) {
      throw new Error("SELECT INTO forbidden");
    }
  }
  return cleaned;
}

export function assertSafeIdent(name: string, label: string): string {
  const n = String(name || "").trim();
  if (!n || n.length > 128 || !/^[A-Za-z0-9_]+$/.test(n)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
  return n;
}
