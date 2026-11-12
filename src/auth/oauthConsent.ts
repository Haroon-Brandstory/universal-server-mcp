import type { Express, Request, Response } from "express";
import { loadPolicy } from "../config.js";
import { writeAudit } from "../audit/logger.js";
import { authenticateOAuthOperator } from "./authenticate.js";
import { getOAuthProvider } from "./oauthProvider.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountOAuthConsentRoutes(app: Express): void {
  app.get("/oauth/consent", (req: Request, res: Response) => {
    const rid = String(req.query.rid || "");
    const provider = getOAuthProvider();
    const pending = provider.getPending(rid);
    if (!pending) {
      res.status(400).send("Unknown or expired consent request");
      return;
    }

    let principalId: string;
    try {
      principalId = provider.resolveConsentPrincipalId(pending.client.client_id);
    } catch (err) {
      res
        .status(500)
        .send(err instanceof Error ? err.message : "Consent misconfigured");
      return;
    }

    const scopes = (pending.params.scopes || ["mcp:tools"]).join(" ");
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>MCP OAuth Consent</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}
label{display:block;margin:.75rem 0 .25rem}
input[type=password]{width:100%;padding:.5rem}
button{margin-right:.5rem;margin-top:1rem;padding:.5rem 1rem}
.deny{background:#eee}
.warn{background:#fff3cd;padding:.75rem;border-radius:4px}
</style></head><body>
<h1>Authorize MCP client</h1>
<p class="warn">Operator authentication required. Auto-approve is disabled.</p>
<p><strong>Client:</strong> ${escapeHtml(pending.client.client_name || pending.client.client_id)}</p>
<p><strong>Client ID:</strong> ${escapeHtml(pending.client.client_id)}</p>
<p><strong>Scopes:</strong> ${escapeHtml(scopes)}</p>
<p><strong>Principal granted:</strong> ${escapeHtml(principalId)} <em>(least-privilege oauth principal)</em></p>
<p><strong>Redirect:</strong> ${escapeHtml(pending.params.redirectUri)}</p>
<form method="post" action="/oauth/consent">
  <input type="hidden" name="rid" value="${escapeHtml(rid)}"/>
  <label>Operator key (MCP_OAUTH_OPERATOR_KEY)</label>
  <input type="password" name="operator_key" required autocomplete="current-password"/>
  <div>
    <button type="submit" name="decision" value="approve">Approve</button>
    <button type="submit" name="decision" value="deny" class="deny">Deny</button>
  </div>
</form>
</body></html>`);
  });

  app.post("/oauth/consent", (req: Request, res: Response) => {
    const rid = String(req.body?.rid || "");
    const decision = String(req.body?.decision || "");
    const operatorKey = String(req.body?.operator_key || "");
    const provider = getOAuthProvider();
    const pending = provider.getPending(rid);

    try {
      const policy = loadPolicy();
      authenticateOAuthOperator(policy, operatorKey);

      if (!pending) {
        res.status(400).send("Unknown or expired consent request");
        return;
      }

      const principalId = provider.resolveConsentPrincipalId(
        pending.client.client_id
      );
      const approve = decision === "approve";
      const { redirectUri } = provider.completeConsent(rid, principalId, approve);

      writeAudit({
        ts: new Date().toISOString(),
        sessionId: "oauth-consent",
        principalId: "oauth-operator",
        tool: "oauth.consent",
        decision: approve ? "allow" : "deny",
        reason: approve ? "operator_approved" : "operator_denied",
        meta: { clientId: pending.client.client_id, oauthPrincipal: principalId },
      });

      res.redirect(302, redirectUri);
    } catch (err) {
      writeAudit({
        ts: new Date().toISOString(),
        sessionId: "oauth-consent",
        principalId: "anonymous",
        tool: "oauth.consent",
        decision: "deny",
        reason: err instanceof Error ? err.message : String(err),
      });
      res
        .status(401)
        .type("html")
        .send(
          `<p>Consent failed: ${escapeHtml(
            err instanceof Error ? err.message : String(err)
          )}</p><p><a href="/oauth/consent?rid=${encodeURIComponent(
            rid
          )}">Retry</a></p>`
        );
    }
  });
}
