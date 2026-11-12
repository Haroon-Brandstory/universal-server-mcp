import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { runWithAuth } from "../auth/requestContext.js";
import { resolveHttpPrincipal } from "../auth/resolveHttpPrincipal.js";
import {
  getOAuthProvider,
  grokOAuthClientId,
} from "../auth/oauthProvider.js";
import { mountOAuthConsentRoutes } from "../auth/oauthConsent.js";
import {
  createGatewayServer,
  shutdownGatewayResources,
} from "../gateway.js";
import type { Principal } from "../types.js";

type TransportSession = {
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  open: number;
  lastActive: number;
  principal: Principal;
  authSessionId: string;
};

const IDLE_MS = 30 * 60_000;
const MAX_SESSIONS = 100;

/** Tunnel / local Host suffixes allowed when MCP_ALLOW_TUNNEL_HOSTS=1 */
const TUNNEL_HOST_SUFFIXES = [
  ".ngrok-free.dev",
  ".ngrok-free.app",
  ".ngrok.app",
  ".ngrok.io",
  ".trycloudflare.com",
];

function httpHost(): string {
  return process.env.MCP_HTTP_HOST || "127.0.0.1";
}

function httpPort(): number {
  return Number(process.env.MCP_HTTP_PORT || 7337);
}

function explicitAllowedHosts(): string[] {
  const base = ["127.0.0.1", "localhost", "[::1]"];
  const extra = (process.env.MCP_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...base, ...extra])];
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (explicitAllowedHosts().includes(host)) return true;
  if (process.env.MCP_ALLOW_TUNNEL_HOSTS === "1") {
    return TUNNEL_HOST_SUFFIXES.some((s) => host.endsWith(s));
  }
  return false;
}

function hostHeaderGuard(req: Request, res: Response, next: NextFunction): void {
  const hostHeader = req.headers.host;
  if (!hostHeader) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Missing Host header" },
      id: null,
    });
    return;
  }
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: `Invalid Host header: ${hostHeader}` },
      id: null,
    });
    return;
  }
  if (!hostAllowed(hostname)) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Invalid Host: ${hostname}. Set MCP_ALLOW_TUNNEL_HOSTS=1 or MCP_ALLOWED_HOSTS=${hostname}`,
      },
      id: null,
    });
    return;
  }
  next();
}

function publicBaseUrl(): URL | null {
  const raw = (process.env.MCP_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function requireHttpAuth(resourceMetadataUrl?: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await resolveHttpPrincipal(req);
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (resourceMetadataUrl) {
        res.setHeader(
          "WWW-Authenticate",
          `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`
        );
      }
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: msg },
        id: null,
      });
    }
  };
}

function trackResponse(session: TransportSession, res: Response): void {
  if (!res.socket || res.destroyed) return;
  session.open++;
  res.on("close", () => {
    session.open--;
    session.lastActive = Date.now();
  });
}

/**
 * Remote MCP for Claude / ChatGPT / Grok / any HTTP MCP client.
 * - POST/GET/DELETE /mcp  → Streamable HTTP (2025-03+)
 * - GET /sse + POST /messages → legacy HTTP+SSE (2024-11-05)
 * Auth: Bearer MCP_API_KEY | OAuth access token (PKCE)
 * OAuth (Grok.com): set MCP_PUBLIC_BASE_URL=https://your-tunnel
 */
export async function startHttpGateway(): Promise<void> {
  const host = httpHost();
  const port = httpPort();
  const app = express();
  // ngrok / reverse proxies send X-Forwarded-For; required for express-rate-limit
  if (publicBaseUrl() || process.env.MCP_TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }
  app.use(hostHeaderGuard);
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ extended: false }));
  const sessions = new Map<string, TransportSession>();

  const pub = publicBaseUrl();
  let resourceMetadataUrl: string | undefined;
  let mcpServerUrl: URL | undefined;

  if (pub) {
    mcpServerUrl = new URL("/mcp", pub);
    const issuerUrl = pub;
    const provider = getOAuthProvider();
    const rateLimitOpts = {
      validate: { xForwardedForHeader: false },
    } as const;
    app.use(
      mcpAuthRouter({
        provider,
        issuerUrl,
        baseUrl: issuerUrl,
        resourceServerUrl: mcpServerUrl,
        scopesSupported: ["mcp:tools"],
        resourceName: "global-server-mcp",
        authorizationOptions: { rateLimit: rateLimitOpts },
        tokenOptions: { rateLimit: rateLimitOpts },
        clientRegistrationOptions: { rateLimit: rateLimitOpts },
      })
    );
    mountOAuthConsentRoutes(app);
    resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpServerUrl);

    app.get("/oauth/grok-setup", (_req, res) => {
      res.json({
        server_url: mcpServerUrl!.href,
        client_id: grokOAuthClientId(),
        client_secret: null,
        authorization_endpoint: new URL("/authorize", pub).href,
        token_endpoint: new URL("/token", pub).href,
        consent_endpoint: new URL("/oauth/consent", pub).href,
        scopes: ["mcp:tools"],
        token_auth_method: "none",
        redirect_uri: "https://grok.com/connectors-oauth-exchange-code/",
        notes:
          "Paste into grok.com Connectors. Leave Client Secret empty. Operator must approve at /oauth/consent with MCP_OAUTH_OPERATOR_KEY — auto-approve is disabled.",
      });
    });
  } else {
    console.error(
      "WARN: MCP_PUBLIC_BASE_URL unset — OAuth for grok.com connectors disabled. Set to your ngrok HTTPS origin."
    );
  }

  // Health (no auth) — minimal fields only (no secrets / principal data)
  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      name: "global-server-mcp",
      version: "0.1.0",
      transport: "http",
      uptimeSec: Math.floor(process.uptime()),
      sessions: sessions.size,
    });
  });

  app.use(
    ["/mcp", "/sse", "/messages", "/metrics"],
    requireHttpAuth(resourceMetadataUrl)
  );

  // Metrics snapshot — auth required (same as MCP)
  app.get("/metrics", async (_req, res) => {
    try {
      const { getMetricsSnapshot } = await import("../platform/observability.js");
      const { listModules } = await import("../platform/modules.js");
      res.json({
        ok: true,
        metrics: getMetricsSnapshot(),
        modules: listModules().map((m) => m.id),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- Streamable HTTP ----
  app.all("/mcp", async (req, res) => {
    try {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId =
        typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
      const existing = sessionId ? sessions.get(sessionId) : undefined;
      let transport: StreamableHTTPServerTransport;

      if (existing) {
        if (!(existing.transport instanceof StreamableHTTPServerTransport)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: session uses a different transport",
            },
            id: null,
          });
          return;
        }
        transport = existing.transport;
        trackResponse(existing, res);
      } else if (
        !sessionId &&
        req.method === "POST" &&
        isInitializeRequest(req.body)
      ) {
        if (sessions.size >= MAX_SESSIONS) {
          res.status(503).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Too many open sessions" },
            id: null,
          });
          return;
        }

        const principal = await resolveHttpPrincipal(req);
        const authSessionId = randomUUID();

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, {
              transport,
              open: 0,
              lastActive: Date.now(),
              principal,
              authSessionId,
            });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const { server } = createGatewayServer();
        await runWithAuth(
          { principal, sessionId: authSessionId },
          async () => {
            await server.connect(transport);
          }
        );
      } else if (sessionId) {
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        });
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      const session = transport.sessionId
        ? sessions.get(transport.sessionId)
        : undefined;
      const principal =
        session?.principal || (await resolveHttpPrincipal(req));
      const authSessionId = session?.authSessionId || randomUUID();

      await runWithAuth({ principal, sessionId: authSessionId }, async () => {
        await transport.handleRequest(req, res, req.body);
      });
    } catch (error) {
      console.error("MCP /mcp error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // ---- Legacy HTTP+SSE ----
  app.get("/sse", async (req, res) => {
    try {
      if (sessions.size >= MAX_SESSIONS) {
        res.status(503).send("Too many open sessions");
        return;
      }
      const principal = await resolveHttpPrincipal(req);
      const authSessionId = randomUUID();

      const transport = new SSEServerTransport("/messages", res);
      const session: TransportSession = {
        transport,
        open: 0,
        lastActive: Date.now(),
        principal,
        authSessionId,
      };
      sessions.set(transport.sessionId, session);
      trackResponse(session, res);
      transport.onclose = () => {
        sessions.delete(transport.sessionId);
      };

      const { server } = createGatewayServer();
      await runWithAuth({ principal, sessionId: authSessionId }, async () => {
        await server.connect(transport);
      });
    } catch (error) {
      console.error("MCP /sse error:", error);
      if (!res.headersSent) res.status(500).send("Internal server error");
    }
  });

  app.post("/messages", async (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const existing = sessions.get(sessionId);
    if (!existing || !(existing.transport instanceof SSEServerTransport)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: unknown SSE session",
        },
        id: null,
      });
      return;
    }
    trackResponse(existing, res);
    const sseTransport = existing.transport;
    await runWithAuth(
      { principal: existing.principal, sessionId: existing.authSessionId },
      async () => {
        await sseTransport.handlePostMessage(req, res, req.body);
      }
    );
  });

  setInterval(() => {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, session] of sessions) {
      if (session.open === 0 && session.lastActive < cutoff) {
        session.transport.close().catch(console.error);
        sessions.delete(id);
      }
    }
  }, 60_000).unref();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });

    const closeAll = async () => {
      for (const [, session] of sessions) {
        try {
          await session.transport.close();
        } catch {
          /* ignore */
        }
      }
      sessions.clear();
      await shutdownGatewayResources();
      server.close();
      process.exit(0);
    };
    process.on("SIGINT", closeAll);
    process.on("SIGTERM", closeAll);
  });

  const lines = [
    `global-server-mcp HTTP listening on http://${host}:${port}`,
    `  Streamable HTTP: POST/GET/DELETE http://${host}:${port}/mcp`,
    `  Legacy SSE:      GET http://${host}:${port}/sse`,
    `  Health:          GET http://${host}:${port}/healthz`,
    `  Auth: Bearer <MCP_API_KEY> or OAuth access token`,
  ];
  if (pub) {
    lines.push(
      `  OAuth AS:        ${pub.href}`,
      `  Grok setup JSON: ${new URL("/oauth/grok-setup", pub).href}`,
      `  Client ID:       ${grokOAuthClientId()}`,
      `  Authorize:       ${new URL("/authorize", pub).href}`,
      `  Token:           ${new URL("/token", pub).href}`
    );
  }
  console.error(lines.join("\n"));
}
