import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Capability, CapabilityClass, Principal } from "../types.js";
import { TOOL_DEFINITIONS } from "../tools/definitions.js";

export const CAPABILITY_CLASS: Record<Capability, CapabilityClass> = {
  "http.request": "read",
  "page.navigate": "read",
  "page.snapshot": "read",
  "page.click": "write",
  "page.fill": "write",
  "page.wait": "read",
  "session.create": "read",
  "session.close": "read",
  "policy.explain": "read",
  "audit.tail": "admin",
  "code.list": "read",
  "code.read": "read",
  "code.write": "write",
  "code.edit": "write",
  "code.search": "read",
  "code.approval.create": "write",
  "git.repo.list": "read",
  "git.repo.info": "read",
  "git.branch.list": "read",
  "git.branch.create": "write",
  "git.file.read": "read",
  "git.diff": "read",
  "git.commit": "write",
  "git.pr.create": "write",
  "git.pr.status": "read",
  "git.ci.status": "read",
  "git.approval.create": "admin",
  "approvals.list": "read",
  "build.detect_stack": "read",
  "build.list_tasks": "read",
  "build.status": "read",
  "build.logs": "read",
  "build.run": "write",
  "build.test": "write",
  "build.lint": "write",
  "build.typecheck": "write",
  "build.cancel": "write",
  "build.approval.create": "admin",
  "server.list": "read",
  "server.health": "read",
  "server.metrics": "read",
  "server.services": "read",
  "server.service.status": "read",
  "server.logs.read": "read",
  "server.ssl.status": "read",
  "server.disk.status": "read",
  "server.processes": "read",
  "server.security.status": "read",
  "server.service.restart": "write",
  "server.cache.clear": "write",
  "server.maintenance.run": "write",
  /** Requestors create pending tickets; humans approve at /operators. */
  "server.approval.create": "write",
  "db.connections": "read",
  "db.health": "read",
  "db.schemas": "read",
  "db.tables": "read",
  "db.table.describe": "read",
  "db.query.read": "read",
  "db.performance": "read",
  "db.indexes": "read",
  "db.migration.plan": "read",
  "db.migration.validate": "read",
  "db.migration.apply": "write",
  "db.backup.status": "read",
  "db.restore.plan": "read",
  "db.approval.create": "admin",
  "security.scan.code": "read",
  "security.scan.dependencies": "read",
  "security.scan.secrets": "read",
  "security.scan.container": "read",
  "security.audit.server": "read",
  "security.audit.headers": "read",
  "security.audit.tls": "read",
  "security.findings": "read",
  "security.remediation.plan": "write",
  "deploy.projects": "read",
  "deploy.environments": "read",
  "deploy.history": "read",
  "deploy.plan": "read",
  "deploy.validate": "read",
  "deploy.staging": "write",
  "deploy.status": "read",
  "deploy.production.request": "write",
  "deploy.rollback.plan": "read",
  "deploy.rollback.request": "write",
  "deploy.approval.create": "admin",
  "platform.info": "read",
  "platform.projects": "read",
  "platform.metrics": "admin",
};

export function capabilityClass(cap: Capability): CapabilityClass {
  return CAPABILITY_CLASS[cap];
}

export function toolsForPrincipal(principal: Principal): Tool[] {
  const caps = new Set(principal.capabilities);
  return TOOL_DEFINITIONS.filter((t) => {
    const name = t.name as Capability;
    if (!caps.has(name)) return false;
    const cls = CAPABILITY_CLASS[name];
    if (cls === "write" && !principal.write) return false;
    if (cls === "admin" && !principal.admin) return false;
    return true;
  });
}
