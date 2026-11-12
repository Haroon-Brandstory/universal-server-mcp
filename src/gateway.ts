import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { loadPolicy } from "./config.js";
import { authenticate } from "./auth/authenticate.js";
import { getRequestAuth } from "./auth/requestContext.js";
import { writeAudit, tailAudit } from "./audit/logger.js";
import { RateLimiter } from "./security/rateLimit.js";
import { assertSafeUrl } from "./security/ssrf.js";
import { redactUrl } from "./security/redact.js";
import {
  explainCapability,
  explainHost,
  explainMethod,
} from "./policy/engine.js";
import { toolsForPrincipal } from "./policy/capabilities.js";
import { httpRequest } from "./adapters/http/client.js";
import * as browser from "./adapters/browser/playwright.js";
import * as codeops from "./adapters/code/fsops.js";
import * as gitops from "./adapters/git/operations.js";
import * as buildops from "./adapters/build/operations.js";
import * as serverops from "./adapters/server/operations.js";
import * as dbops from "./adapters/db/operations.js";
import * as securityops from "./adapters/security/operations.js";
import * as deployops from "./adapters/deploy/operations.js";
import * as platformops from "./platform/operations.js";
import {
  newTraceId,
  recordToolMetric,
  structuredLog,
} from "./platform/observability.js";
import { withRetry } from "./platform/retry.js";
import { SessionManager } from "./session/manager.js";
import type { AuthContext, Capability, PolicyDocument } from "./types.js";

/** Process-wide browser sessions — each entry bound to a principalId. */
const sharedSessions = new SessionManager();
let sharedLimiter: RateLimiter | null = null;

function getLimiter(perMin: number): RateLimiter {
  if (!sharedLimiter) sharedLimiter = new RateLimiter(perMin);
  return sharedLimiter;
}

export async function shutdownGatewayResources(): Promise<void> {
  await sharedSessions.closeAll();
}

export interface GatewayRuntime {
  server: Server;
  sessions: SessionManager;
  shutdown: () => Promise<void>;
}

export function createGatewayServer(): GatewayRuntime {
  let policy: PolicyDocument = loadPolicy();
  const sessions = sharedSessions;
  const limiter = getLimiter(policy.rate_limit_per_min);
  const gatewaySessionId = randomUUID();

  const authCtx = (): AuthContext => {
    const fromRequest = getRequestAuth();
    if (fromRequest) return fromRequest;
    const principal = authenticate(policy);
    return { principal, sessionId: gatewaySessionId };
  };

  const server = new Server(
    { name: "global-server-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    policy = loadPolicy();
    const ctx = authCtx();
    return { tools: toolsForPrincipal(ctx.principal) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;

    policy = loadPolicy();
    if (policy.kill_switch) sessions.kill();

    let ctx: AuthContext;
    try {
      ctx = authCtx();
    } catch (err) {
      writeAudit({
        ts: new Date().toISOString(),
        sessionId: gatewaySessionId,
        principalId: "anonymous",
        tool,
        decision: "deny",
        reason: err instanceof Error ? err.message : String(err),
      });
      return textResult(
        `DENY: ${err instanceof Error ? err.message : String(err)}`,
        true
      );
    }

    const rlKey = `${ctx.principal.id}:${ctx.sessionId}`;
    const rl = limiter.check(rlKey);
    if (!rl.ok) {
      writeAudit({
        ts: new Date().toISOString(),
        sessionId: ctx.sessionId,
        principalId: ctx.principal.id,
        tool,
        decision: "deny",
        reason: "rate_limit",
      });
      return textResult(
        `DENY: rate limit exceeded; retry in ${rl.retryAfterMs}ms`,
        true
      );
    }

    const targetRaw = typeof args.url === "string" ? args.url : undefined;
    const traceId = newTraceId();
    const started = Date.now();

    try {
      const result = await withRetry(tool, () =>
        dispatch(tool, args, ctx, policy, sessions)
      );
      const durationMs = Date.now() - started;
      recordToolMetric({
        tool,
        decision: "allow",
        durationMs,
        principalId: ctx.principal.id,
        sessionId: ctx.sessionId,
        traceId,
      });
      writeAudit({
        ts: new Date().toISOString(),
        sessionId: ctx.sessionId,
        principalId: ctx.principal.id,
        tool,
        decision: "allow",
        target: targetRaw ? redactUrl(targetRaw) : undefined,
        meta: { traceId, durationMs },
      });
      return textResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - started;
      recordToolMetric({
        tool,
        decision: "deny",
        durationMs,
        principalId: ctx.principal.id,
        sessionId: ctx.sessionId,
        traceId,
        error: true,
      });
      structuredLog("warn", "tool_deny", {
        traceId,
        tool,
        principalId: ctx.principal.id,
        reason: msg.slice(0, 200),
      });
      writeAudit({
        ts: new Date().toISOString(),
        sessionId: ctx.sessionId,
        principalId: ctx.principal.id,
        tool,
        decision: "deny",
        reason: msg,
        target: targetRaw ? redactUrl(targetRaw) : undefined,
        meta: { traceId, durationMs },
      });
      return textResult(`DENY: ${msg}`, true);
    }
  });

  return {
    server,
    sessions,
    shutdown: shutdownGatewayResources,
  };
}

export async function startStdioGateway(): Promise<void> {
  const { server, shutdown } = createGatewayServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const onSignal = async () => {
    await shutdown();
    process.exit(0);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

function requireCap(
  ctx: AuthContext,
  policy: PolicyDocument,
  cap: Capability
): void {
  const d = explainCapability(ctx, cap, policy);
  if (!d.allow) throw new Error(d.reason);
}

async function gateUrl(
  ctx: AuthContext,
  policy: PolicyDocument,
  url: string
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol === "about:") {
    throw new Error("about: URLs not allowed as navigation target");
  }
  const hostDec = explainHost(ctx, parsed.hostname, policy);
  if (!hostDec.allow) throw new Error(hostDec.reason);

  const ssrf = await assertSafeUrl(url, policy.ssrf, policy.deny_hosts);
  if (!ssrf.ok) throw new Error(ssrf.reason || "SSRF blocked");
  return parsed;
}

async function dispatch(
  tool: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  policy: PolicyDocument,
  sessions: SessionManager
): Promise<string> {
  switch (tool) {
    case "policy.explain": {
      requireCap(ctx, policy, "policy.explain");
      const capability = String(args.capability || "");
      const host = args.host ? String(args.host) : undefined;
      const method = args.method ? String(args.method) : undefined;
      const parts = [];
      if (capability) {
        parts.push(explainCapability(ctx, capability as Capability, policy));
      }
      if (host) parts.push(explainHost(ctx, host, policy));
      if (method) parts.push(explainMethod(ctx, method));
      return JSON.stringify(
        {
          principal: ctx.principal.id,
          environment: policy.environment || null,
          kill_switch: policy.kill_switch,
          decisions: parts,
          capabilities: ctx.principal.capabilities,
          allow_hosts: ctx.principal.allow_hosts,
          allow_paths: ctx.principal.allow_paths || [],
          allow_repos: ctx.principal.allow_repos || [],
          projects: ctx.principal.projects || [],
          write: ctx.principal.write,
          admin: Boolean(ctx.principal.admin),
        },
        null,
        2
      );
    }

    case "audit.tail": {
      requireCap(ctx, policy, "audit.tail");
      const limit = Math.min(Number(args.limit || 50), 200);
      return JSON.stringify(tailAudit(limit), null, 2);
    }

    case "session.create": {
      requireCap(ctx, policy, "session.create");
      const s = await sessions.create(ctx.principal.id);
      return JSON.stringify({ sessionId: s.id, principalId: s.principalId });
    }

    case "session.close": {
      requireCap(ctx, policy, "session.close");
      const sessionId = String(args.sessionId || "");
      await sessions.close(sessionId, ctx.principal.id);
      return JSON.stringify({ closed: sessionId });
    }

    case "http.request": {
      requireCap(ctx, policy, "http.request");
      const url = String(args.url || "");
      const method = String(args.method || "GET").toUpperCase();
      const methodDec = explainMethod(ctx, method);
      if (!methodDec.allow) throw new Error(methodDec.reason);
      await gateUrl(ctx, policy, url);
      const result = await httpRequest({
        url,
        method,
        headers: (args.headers as Record<string, string>) || undefined,
        body: args.body ? String(args.body) : undefined,
        maxResponseBytes: ctx.principal.max_response_bytes,
      });
      return JSON.stringify(result, null, 2);
    }

    case "page.navigate": {
      requireCap(ctx, policy, "page.navigate");
      const sessionId = String(args.sessionId || "");
      const url = String(args.url || "");
      await gateUrl(ctx, policy, url);
      const s = sessions.get(sessionId, ctx.principal.id);
      const out = await browser.navigate(s.page, url, async (finalUrl) => {
        await gateUrl(ctx, policy, finalUrl);
      });
      return JSON.stringify(out);
    }

    case "page.snapshot": {
      requireCap(ctx, policy, "page.snapshot");
      const sessionId = String(args.sessionId || "");
      const s = sessions.get(sessionId, ctx.principal.id);
      return await browser.snapshot(s.page, ctx.principal.max_response_bytes);
    }

    case "page.click": {
      requireCap(ctx, policy, "page.click");
      const sessionId = String(args.sessionId || "");
      const selector = String(args.selector || "");
      if (!selector) throw new Error("selector required");
      await browser.click(sessions.get(sessionId, ctx.principal.id).page, selector);
      return JSON.stringify({ clicked: selector });
    }

    case "page.fill": {
      requireCap(ctx, policy, "page.fill");
      const sessionId = String(args.sessionId || "");
      const selector = String(args.selector || "");
      const value = String(args.value ?? "");
      if (!selector) throw new Error("selector required");
      await browser.fill(
        sessions.get(sessionId, ctx.principal.id).page,
        selector,
        value
      );
      return JSON.stringify({ filled: selector });
    }

    case "page.wait": {
      requireCap(ctx, policy, "page.wait");
      const sessionId = String(args.sessionId || "");
      await browser.waitFor(
        sessions.get(sessionId, ctx.principal.id).page,
        args.selector ? String(args.selector) : undefined,
        args.text ? String(args.text) : undefined,
        args.timeoutMs ? Number(args.timeoutMs) : 10_000
      );
      return JSON.stringify({ waited: true });
    }

    case "code.list": {
      requireCap(ctx, policy, "code.list");
      const path = String(args.path || "");
      return JSON.stringify(
        codeops.listDir(ctx.principal.allow_paths || [], path),
        null,
        2
      );
    }

    case "code.read": {
      requireCap(ctx, policy, "code.read");
      const path = String(args.path || "");
      return JSON.stringify(
        codeops.readFile(
          ctx.principal.allow_paths || [],
          path,
          ctx.principal.max_response_bytes
        ),
        null,
        2
      );
    }

    case "code.write": {
      requireCap(ctx, policy, "code.write");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      const path = String(args.path || "");
      const content = String(args.content ?? "");
      return JSON.stringify(
        codeops.writeFile(ctx.principal.allow_paths || [], path, content),
        null,
        2
      );
    }

    case "code.edit": {
      requireCap(ctx, policy, "code.edit");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      const path = String(args.path || "");
      const oldString = String(args.oldString ?? "");
      const newString = String(args.newString ?? "");
      const replaceAll = Boolean(args.replaceAll);
      return JSON.stringify(
        codeops.editFile(
          ctx.principal.allow_paths || [],
          path,
          oldString,
          newString,
          replaceAll
        ),
        null,
        2
      );
    }

    case "code.search": {
      requireCap(ctx, policy, "code.search");
      const path = String(args.path || "");
      const query = String(args.query || "");
      const maxHits = Math.min(Number(args.maxHits || 50), 100);
      return JSON.stringify(
        codeops.searchFiles(
          ctx.principal.allow_paths || [],
          path,
          query,
          maxHits
        ),
        null,
        2
      );
    }

    case "git.repo.list": {
      requireCap(ctx, policy, "git.repo.list");
      return JSON.stringify(await gitops.repoList(ctx.principal), null, 2);
    }

    case "git.repo.info": {
      requireCap(ctx, policy, "git.repo.info");
      return JSON.stringify(
        await gitops.repoInfo(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "git.branch.list": {
      requireCap(ctx, policy, "git.branch.list");
      return JSON.stringify(
        await gitops.branchList(ctx.principal, args),
        null,
        2
      );
    }

    case "git.branch.create": {
      requireCap(ctx, policy, "git.branch.create");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await gitops.branchCreate(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "git.file.read": {
      requireCap(ctx, policy, "git.file.read");
      return JSON.stringify(
        await gitops.fileRead(ctx.principal, args),
        null,
        2
      );
    }

    case "git.diff": {
      requireCap(ctx, policy, "git.diff");
      return JSON.stringify(await gitops.diff(ctx.principal, args), null, 2);
    }

    case "git.commit": {
      requireCap(ctx, policy, "git.commit");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await gitops.commit(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "git.pr.create": {
      requireCap(ctx, policy, "git.pr.create");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await gitops.prCreate(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "git.pr.status": {
      requireCap(ctx, policy, "git.pr.status");
      return JSON.stringify(
        await gitops.prStatus(ctx.principal, args),
        null,
        2
      );
    }

    case "git.ci.status": {
      requireCap(ctx, policy, "git.ci.status");
      return JSON.stringify(
        await gitops.ciStatus(ctx.principal, args),
        null,
        2
      );
    }

    case "git.approval.create": {
      requireCap(ctx, policy, "git.approval.create");
      return JSON.stringify(
        gitops.approvalCreate(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "build.detect_stack": {
      requireCap(ctx, policy, "build.detect_stack");
      return JSON.stringify(
        buildops.detectStack(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "build.list_tasks": {
      requireCap(ctx, policy, "build.list_tasks");
      return JSON.stringify(
        buildops.listTasks(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "build.run": {
      requireCap(ctx, policy, "build.run");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await buildops.run(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "build.test": {
      requireCap(ctx, policy, "build.test");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await buildops.test(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "build.lint": {
      requireCap(ctx, policy, "build.lint");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await buildops.lint(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "build.typecheck": {
      requireCap(ctx, policy, "build.typecheck");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await buildops.typecheck(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "build.status": {
      requireCap(ctx, policy, "build.status");
      return JSON.stringify(buildops.status(ctx.principal, args), null, 2);
    }

    case "build.logs": {
      requireCap(ctx, policy, "build.logs");
      return JSON.stringify(buildops.logs(ctx.principal, args), null, 2);
    }

    case "build.cancel": {
      requireCap(ctx, policy, "build.cancel");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(buildops.cancel(ctx.principal, args), null, 2);
    }

    case "build.approval.create": {
      requireCap(ctx, policy, "build.approval.create");
      return JSON.stringify(
        buildops.approvalCreate(ctx.principal, args),
        null,
        2
      );
    }

    case "server.list": {
      requireCap(ctx, policy, "server.list");
      return JSON.stringify(serverops.listServers(policy, ctx.principal), null, 2);
    }

    case "server.health": {
      requireCap(ctx, policy, "server.health");
      return JSON.stringify(
        await serverops.health(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.metrics": {
      requireCap(ctx, policy, "server.metrics");
      return JSON.stringify(
        await serverops.metrics(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.services": {
      requireCap(ctx, policy, "server.services");
      return JSON.stringify(
        await serverops.services(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.service.status": {
      requireCap(ctx, policy, "server.service.status");
      return JSON.stringify(
        await serverops.serviceStatus(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.logs.read": {
      requireCap(ctx, policy, "server.logs.read");
      return JSON.stringify(
        await serverops.logsRead(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.ssl.status": {
      requireCap(ctx, policy, "server.ssl.status");
      return JSON.stringify(
        await serverops.sslStatus(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.disk.status": {
      requireCap(ctx, policy, "server.disk.status");
      return JSON.stringify(
        await serverops.diskStatus(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.processes": {
      requireCap(ctx, policy, "server.processes");
      return JSON.stringify(
        await serverops.processes(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.security.status": {
      requireCap(ctx, policy, "server.security.status");
      return JSON.stringify(
        await serverops.securityStatus(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.service.restart": {
      requireCap(ctx, policy, "server.service.restart");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await serverops.serviceRestart(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.cache.clear": {
      requireCap(ctx, policy, "server.cache.clear");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await serverops.cacheClear(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.maintenance.run": {
      requireCap(ctx, policy, "server.maintenance.run");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await serverops.maintenanceRun(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "server.approval.create": {
      requireCap(ctx, policy, "server.approval.create");
      return JSON.stringify(
        serverops.approvalCreate(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "db.connections": {
      requireCap(ctx, policy, "db.connections");
      return JSON.stringify(dbops.listConnections(policy, ctx.principal), null, 2);
    }

    case "db.health": {
      requireCap(ctx, policy, "db.health");
      return JSON.stringify(
        await dbops.health(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.schemas": {
      requireCap(ctx, policy, "db.schemas");
      return JSON.stringify(
        await dbops.schemas(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.tables": {
      requireCap(ctx, policy, "db.tables");
      return JSON.stringify(
        await dbops.tables(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.table.describe": {
      requireCap(ctx, policy, "db.table.describe");
      return JSON.stringify(
        await dbops.tableDescribe(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.query.read": {
      requireCap(ctx, policy, "db.query.read");
      return JSON.stringify(
        await dbops.queryRead(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.performance": {
      requireCap(ctx, policy, "db.performance");
      return JSON.stringify(
        await dbops.performance(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.indexes": {
      requireCap(ctx, policy, "db.indexes");
      return JSON.stringify(
        await dbops.indexes(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.migration.plan": {
      requireCap(ctx, policy, "db.migration.plan");
      return JSON.stringify(
        dbops.migrationPlan(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.migration.validate": {
      requireCap(ctx, policy, "db.migration.validate");
      return JSON.stringify(
        dbops.migrationValidate(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.migration.apply": {
      requireCap(ctx, policy, "db.migration.apply");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await dbops.migrationApply(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.backup.status": {
      requireCap(ctx, policy, "db.backup.status");
      return JSON.stringify(
        await dbops.backupStatus(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.restore.plan": {
      requireCap(ctx, policy, "db.restore.plan");
      return JSON.stringify(
        dbops.restorePlan(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "db.approval.create": {
      requireCap(ctx, policy, "db.approval.create");
      return JSON.stringify(
        dbops.approvalCreate(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "security.scan.code": {
      requireCap(ctx, policy, "security.scan.code");
      return JSON.stringify(
        await securityops.scanCode(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.scan.dependencies": {
      requireCap(ctx, policy, "security.scan.dependencies");
      return JSON.stringify(
        await securityops.scanDependencies(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.scan.secrets": {
      requireCap(ctx, policy, "security.scan.secrets");
      return JSON.stringify(
        await securityops.scanSecrets(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.scan.container": {
      requireCap(ctx, policy, "security.scan.container");
      return JSON.stringify(
        await securityops.scanContainer(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.audit.server": {
      requireCap(ctx, policy, "security.audit.server");
      return JSON.stringify(
        await securityops.auditServer(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.audit.headers": {
      requireCap(ctx, policy, "security.audit.headers");
      return JSON.stringify(
        await securityops.auditHeaders(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.audit.tls": {
      requireCap(ctx, policy, "security.audit.tls");
      return JSON.stringify(
        await securityops.auditTls(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.findings": {
      requireCap(ctx, policy, "security.findings");
      return JSON.stringify(
        securityops.findings(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "security.remediation.plan": {
      requireCap(ctx, policy, "security.remediation.plan");
      return JSON.stringify(
        await securityops.remediationPlan(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.projects": {
      requireCap(ctx, policy, "deploy.projects");
      return JSON.stringify(deployops.listProjects(policy, ctx.principal), null, 2);
    }

    case "deploy.environments": {
      requireCap(ctx, policy, "deploy.environments");
      return JSON.stringify(
        deployops.listEnvironments(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.history": {
      requireCap(ctx, policy, "deploy.history");
      return JSON.stringify(deployops.history(policy, ctx.principal, args), null, 2);
    }

    case "deploy.plan": {
      requireCap(ctx, policy, "deploy.plan");
      return JSON.stringify(deployops.plan(policy, ctx.principal, args), null, 2);
    }

    case "deploy.validate": {
      requireCap(ctx, policy, "deploy.validate");
      return JSON.stringify(
        deployops.validate(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.staging": {
      requireCap(ctx, policy, "deploy.staging");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await deployops.staging(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.status": {
      requireCap(ctx, policy, "deploy.status");
      return JSON.stringify(
        await deployops.status(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.production.request": {
      requireCap(ctx, policy, "deploy.production.request");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await deployops.productionRequest(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.rollback.plan": {
      requireCap(ctx, policy, "deploy.rollback.plan");
      return JSON.stringify(
        deployops.rollbackPlan(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.rollback.request": {
      requireCap(ctx, policy, "deploy.rollback.request");
      if (!ctx.principal.write) throw new Error("Principal write=false");
      return JSON.stringify(
        await deployops.rollbackRequest(policy, ctx.principal, args),
        null,
        2
      );
    }

    case "deploy.approval.create": {
      requireCap(ctx, policy, "deploy.approval.create");
      return JSON.stringify(
        deployops.approvalCreate(ctx.principal, policy, args),
        null,
        2
      );
    }

    case "platform.info": {
      requireCap(ctx, policy, "platform.info");
      return JSON.stringify(platformops.platformInfo(policy), null, 2);
    }

    case "platform.projects": {
      requireCap(ctx, policy, "platform.projects");
      return JSON.stringify(
        platformops.platformProjects(policy, ctx.principal),
        null,
        2
      );
    }

    case "platform.metrics": {
      requireCap(ctx, policy, "platform.metrics");
      return JSON.stringify(
        platformops.platformMetrics(policy, ctx.principal),
        null,
        2
      );
    }

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
