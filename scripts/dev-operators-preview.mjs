/**
 * Local preview: HTTP gateway + sample pending approvals for /operators UI.
 * Usage: node --env-file=.env scripts/dev-operators-preview.mjs
 */
import { createCodeWriteApproval } from "../src/adapters/code/approval.ts";
import { startHttpGateway } from "../src/transport/httpServer.ts";

process.env.MCP_TRANSPORT = "http";
process.env.MCP_HTTP_HOST = process.env.MCP_HTTP_HOST || "127.0.0.1";
process.env.MCP_HTTP_PORT = process.env.MCP_HTTP_PORT || "7337";

createCodeWriteApproval({
  principalId: "local-dev",
  pathPrefix: "/var/www/html/global-brandstory/app",
  summary: "Update homepage hero headline and CTA label",
});
createCodeWriteApproval({
  principalId: "local-dev",
  pathPrefix: "/var/www/html/global-brandstory/components",
  summary: "Fix mobile nav overlap on Services page",
});
createCodeWriteApproval({
  principalId: "oauth-remote",
  pathPrefix: "/var/www/html/global-backend/bsd-strapi/src",
  summary: "Add blogs content-type field for featured image alt text",
});

await startHttpGateway();
