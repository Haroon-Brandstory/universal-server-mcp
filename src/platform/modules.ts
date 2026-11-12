/**
 * Stable module catalog for the universal MCP platform.
 * Adapters stay thin; AuthN/AuthZ/audit/approvals live in gateway + policy.
 */

export type ModuleId =
  | "webops"
  | "codeops"
  | "gitops"
  | "buildops"
  | "serverops"
  | "databaseops"
  | "securityops"
  | "deployops"
  | "platform";

export interface ModuleDescriptor {
  id: ModuleId;
  label: string;
  capabilityPrefix: string;
  adapterPath: string;
  status: "ga" | "beta" | "experimental";
  notes: string;
}

/** Register additional module metadata without editing gateway dispatch. */
const EXTRA: ModuleDescriptor[] = [];

export function registerModule(desc: ModuleDescriptor): void {
  if (!desc?.id) throw new Error("Invalid module descriptor");
  const idx = EXTRA.findIndex((m) => m.id === desc.id);
  if (idx >= 0) EXTRA[idx] = desc;
  else EXTRA.push(desc);
}

export function listModules(): ModuleDescriptor[] {
  const core: ModuleDescriptor[] = [
    {
      id: "webops",
      label: "WebOps",
      capabilityPrefix: "http.|page.|session.",
      adapterPath: "src/adapters/http|browser",
      status: "ga",
      notes: "HTTP + Playwright; principal-bound sessions",
    },
    {
      id: "codeops",
      label: "CodeOps",
      capabilityPrefix: "code.",
      adapterPath: "src/adapters/code",
      status: "ga",
      notes: "allow_paths filesystem tools",
    },
    {
      id: "gitops",
      label: "GitOps",
      capabilityPrefix: "git.",
      adapterPath: "src/adapters/git",
      status: "ga",
      notes: "GitHub App; no force-push/merge",
    },
    {
      id: "buildops",
      label: "BuildOps",
      capabilityPrefix: "build.",
      adapterPath: "src/adapters/build",
      status: "ga",
      notes: "Curated tasks; docker preferred",
    },
    {
      id: "serverops",
      label: "ServerOps",
      capabilityPrefix: "server.",
      adapterPath: "src/adapters/server",
      status: "ga",
      notes: "Restricted SSH/mock; no auto agent install",
    },
    {
      id: "databaseops",
      label: "DatabaseOps",
      capabilityPrefix: "db.",
      adapterPath: "src/adapters/db",
      status: "ga",
      notes: "PG/MySQL first; curated migrations",
    },
    {
      id: "securityops",
      label: "SecurityOps",
      capabilityPrefix: "security.",
      adapterPath: "src/adapters/security",
      status: "ga",
      notes: "Defensive scans; unverified ≠ confirmed",
    },
    {
      id: "deployops",
      label: "DeployOps",
      capabilityPrefix: "deploy.",
      adapterPath: "src/adapters/deploy",
      status: "ga",
      notes: "Human-gated prod; dispatch off by default",
    },
    {
      id: "platform",
      label: "Platform",
      capabilityPrefix: "platform.",
      adapterPath: "src/platform",
      status: "ga",
      notes: "Registry, modules, observability",
    },
  ];
  return [...core, ...EXTRA];
}
