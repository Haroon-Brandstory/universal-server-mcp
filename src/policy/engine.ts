import type { AuthContext, Capability, PolicyDocument } from "../types.js";
import { capabilityClass } from "./capabilities.js";

export interface PolicyDecision {
  allow: boolean;
  reason: string;
}

export function explainCapability(
  ctx: AuthContext,
  capability: Capability,
  policy: PolicyDocument
): PolicyDecision {
  if (policy.kill_switch) {
    return { allow: false, reason: "Kill switch active" };
  }
  if (!ctx.principal.capabilities.includes(capability)) {
    return {
      allow: false,
      reason: `Principal ${ctx.principal.id} missing capability ${capability}`,
    };
  }
  const cls = capabilityClass(capability);
  if (cls === "write" && !ctx.principal.write) {
    return {
      allow: false,
      reason: `Principal ${ctx.principal.id} write=false; blocked write capability ${capability}`,
    };
  }
  if (cls === "admin" && !ctx.principal.admin) {
    return {
      allow: false,
      reason: `Principal ${ctx.principal.id} admin=false; blocked admin capability ${capability}`,
    };
  }
  return { allow: true, reason: "capability granted" };
}

export function explainHost(
  ctx: AuthContext,
  hostname: string,
  policy: PolicyDocument
): PolicyDecision {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (policy.deny_hosts.map((h) => h.toLowerCase()).includes(host)) {
    return { allow: false, reason: `Host in deny_hosts: ${host}` };
  }
  const allowed = ctx.principal.allow_hosts.map((h) => h.toLowerCase());
  const ok =
    allowed.includes(host) ||
    allowed.some(
      (a) =>
        a.startsWith("*.") &&
        (host === a.slice(2) || host.endsWith("." + a.slice(2)))
    );
  if (!ok) {
    return {
      allow: false,
      reason: `Host ${host} not in allow_hosts for ${ctx.principal.id}`,
    };
  }
  return { allow: true, reason: "host allowed" };
}

export function explainMethod(
  ctx: AuthContext,
  method: string
): PolicyDecision {
  const m = method.toUpperCase();
  if (!ctx.principal.allow_methods.map((x) => x.toUpperCase()).includes(m)) {
    return { allow: false, reason: `Method ${m} not allowed` };
  }
  if (!ctx.principal.write && !["GET", "HEAD", "OPTIONS"].includes(m)) {
    return { allow: false, reason: "Principal write=false; only safe methods" };
  }
  return { allow: true, reason: "method allowed" };
}
