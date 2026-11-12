import type { PolicyDocument, Principal } from "../types.js";
import { listModules } from "./modules.js";
import { getMetricsSnapshot } from "./observability.js";
import { loadProjectsDocument, publicProjectView } from "./projectRegistry.js";
import { loadStackProfiles } from "./stackProfiles.js";

export function platformInfo(policy: PolicyDocument) {
  const stacks = loadStackProfiles(policy);
  return {
    name: "global-server-mcp",
    version: "0.1.0",
    architecture: "policy-gated universal MCP gateway",
    transports: ["stdio", "streamable-http", "sse-legacy"],
    modules: listModules(),
    stackProfiles: stacks.profiles.map((p) => ({
      id: p.id,
      ecosystem: p.ecosystem,
      status: p.status,
      note: p.notes || null,
    })),
    governance: {
      defaultDeny: true,
      killSwitch: Boolean(policy.kill_switch),
      revokedPrincipals: policy.platform?.revoked_principal_ids || [],
      productionDeployDispatch:
        policy.deployops?.allow_production_dispatch === true,
    },
    disclaimer:
      "Protocol-compatible != certified. Stack status experimental/planned until integration-tested.",
  };
}

export function platformProjects(
  policy: PolicyDocument,
  principal: Principal
) {
  const projects = policy.projects || [];
  const allowed = principal.projects || [];
  return {
    projects: projects
      .map((p) => publicProjectView(p, allowed))
      .filter(Boolean),
    registryPath:
      policy.platform?.projects_path ||
      process.env.MCP_PROJECTS_PATH ||
      "./config/projects.yaml",
    registryCount: loadProjectsDocument(policy).projects.length,
  };
}

export function platformMetrics(
  _policy: PolicyDocument,
  _principal: Principal
) {
  return {
    metrics: getMetricsSnapshot(),
    note: "In-process counters + optional logs/metrics.jsonl",
  };
}
