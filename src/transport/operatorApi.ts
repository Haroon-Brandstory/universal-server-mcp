import type { Express, Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  approveOperatorApproval,
  denyOperatorApproval,
  listOperatorApprovals,
} from "../auth/operatorApprovals.js";
import { writeAudit } from "../audit/logger.js";
import { sendOperatorUi } from "./operatorUi.js";

/**
 * Operator browser UI + REST API at /operators.
 * Auth uses MCP_OPERATOR_TOKEN (approval password), not MCP_API_KEY / OAuth bot tokens.
 * AI creates pending approvals; humans approve here; then tell the agent to proceed.
 */
export function mountOperatorRoutes(app: Express): void {
  app.get(["/operators", "/operators/", "/operators/ui"], (_req, res) => {
    sendOperatorUi(res);
  });
  app.get("/operator", (_req, res) => {
    res.redirect(302, "/operators");
  });
  app.get("/operator/", (_req, res) => {
    res.redirect(302, "/operators");
  });

  app.get("/operators/meta", (_req, res) => {
    res.json({
      name: "global-server-mcp",
      totpRequired: false,
    });
  });

  app.get(
    "/operators/approvals",
    requireOperatorAuth,
    (_req: Request, res: Response) => {
      res.json({
        name: "global-server-mcp",
        approvals: listOperatorApprovals(),
      });
    }
  );

  app.post(
    "/operators/approvals/:id/approve",
    requireOperatorAuth,
    (req: Request, res: Response) => {
      try {
        if (req.body?.confirm !== true) {
          res.status(400).json({ error: 'Pass {"confirm":true} to approve.' });
          return;
        }
        const id = String(req.params.id || "");
        const token = bearerToken(req)!;
        const approval = approveOperatorApproval(id, token);
        writeAudit({
          ts: new Date().toISOString(),
          sessionId: "operator-ui",
          principalId: "operator-ui",
          tool: "operator.approve",
          decision: "allow",
          meta: { approvalId: approval.id, module: approval.module },
        });
        res.json({
          approvalId: approval.id,
          module: approval.module,
          action: approval.action,
          status: approval.status,
          expiresAt: approval.expiresAt,
          next: "Tell the AI agent to apply the change with this approvalId.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = /invalid/i.test(msg) ? 401 : 400;
        res.status(status).json({ error: msg });
      }
    }
  );

  app.post(
    "/operators/approvals/:id/deny",
    requireOperatorAuth,
    (req: Request, res: Response) => {
      try {
        if (req.body?.confirm !== true) {
          res.status(400).json({ error: 'Pass {"confirm":true} to deny.' });
          return;
        }
        const id = String(req.params.id || "");
        const token = bearerToken(req)!;
        const approval = denyOperatorApproval(id, token);
        writeAudit({
          ts: new Date().toISOString(),
          sessionId: "operator-ui",
          principalId: "operator-ui",
          tool: "operator.deny",
          decision: "allow",
          meta: { approvalId: approval.id, module: approval.module },
        });
        res.json({
          approvalId: approval.id,
          module: approval.module,
          action: approval.action,
          status: approval.status,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = /invalid/i.test(msg) ? 401 : 400;
        res.status(status).json({ error: msg });
      }
    }
  );
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? header.match(/^Bearer\s+(\S+)$/i) : null;
  return match ? match[1] : null;
}

function requireOperatorAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = process.env.MCP_OPERATOR_TOKEN?.trim() || "";
  if (expected.length < 16) {
    res.status(503).json({
      error: "MCP_OPERATOR_TOKEN is not configured (≥16 chars).",
    });
    return;
  }
  const givenRaw = bearerToken(req);
  if (!givenRaw) {
    res.status(401).json({ error: "Operator bearer token required." });
    return;
  }
  const given = Buffer.from(givenRaw);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    res.status(401).json({ error: "Operator token is invalid." });
    return;
  }
  next();
}
