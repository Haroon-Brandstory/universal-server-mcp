import type { ScanKind, SecurityScanner } from "../types.js";
import {
  builtinCodeScanner,
  builtinSecretsScanner,
  frameworkScanner,
} from "./builtin.js";
import {
  gitleaksScanner,
  osvScanner,
  semgrepScanner,
  trivyScanner,
} from "./external.js";
import { headersScanner, tlsScanner } from "./httpTls.js";
import { npmAuditScanner } from "./npmAudit.js";

const BASE: SecurityScanner[] = [
  builtinCodeScanner,
  builtinSecretsScanner,
  frameworkScanner,
  npmAuditScanner,
  semgrepScanner,
  gitleaksScanner,
  osvScanner,
  trivyScanner,
  headersScanner,
  tlsScanner,
];

export function scannersForKind(
  kind: ScanKind,
  extra: SecurityScanner[] = []
): SecurityScanner[] {
  return [...BASE, ...extra].filter((s) => s.kinds.includes(kind));
}

export { PINNED_TOOLS } from "./external.js";
