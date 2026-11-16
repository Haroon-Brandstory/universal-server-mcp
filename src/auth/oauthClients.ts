/**
 * Well-known remote MCP OAuth clients + redirect allowlists.
 * Exact URIs + safe prefixes (ChatGPT per-connector callbacks).
 * New AI: add entry here + policy map; DCR covers the rest when enabled.
 */

export type KnownOAuthClient = {
  /** Env override for client_id, e.g. MCP_OAUTH_CHATGPT_CLIENT_ID */
  idEnv: string;
  defaultId: string;
  clientName: string;
  /** Exact redirect_uris registered on this client */
  redirectUris: string[];
  /** Setup path slug: /oauth/{slug}-setup */
  setupSlug: string;
  notes: string;
};

export const GROK_OAUTH_REDIRECT =
  "https://grok.com/connectors-oauth-exchange-code/";
export const CLAUDE_OAUTH_REDIRECT =
  "https://claude.ai/api/mcp/auth_callback";
export const CHATGPT_OAUTH_REDIRECT =
  "https://chatgpt.com/connector_platform_oauth_redirect";
export const CURSOR_DESKTOP_OAUTH_REDIRECT =
  "http://localhost:8787/callback";
export const CURSOR_WEB_OAUTH_REDIRECT =
  "https://www.cursor.com/agents/mcp/oauth/callback";

/** Built-in exact redirects (always merged into allowlist). */
export const BUILTIN_OAUTH_REDIRECTS: string[] = [
  GROK_OAUTH_REDIRECT,
  CLAUDE_OAUTH_REDIRECT,
  CHATGPT_OAUTH_REDIRECT,
  CURSOR_DESKTOP_OAUTH_REDIRECT,
  CURSOR_WEB_OAUTH_REDIRECT,
];

/**
 * Prefix allowlist for dynamic per-connection callbacks.
 * Only https://chatgpt.com/connector/oauth/… (no open http://).
 */
export const BUILTIN_OAUTH_REDIRECT_PREFIXES: string[] = [
  "https://chatgpt.com/connector/oauth/",
];

export const KNOWN_OAUTH_CLIENTS: KnownOAuthClient[] = [
  {
    idEnv: "MCP_OAUTH_GROK_CLIENT_ID",
    defaultId: "global-server-mcp-grok",
    clientName: "Grok Web Connectors",
    redirectUris: [GROK_OAUTH_REDIRECT],
    setupSlug: "grok",
    notes:
      "Paste into grok.com Connectors. Leave Client Secret empty. Approve at /oauth/consent with MCP_OAUTH_OPERATOR_KEY.",
  },
  {
    idEnv: "MCP_OAUTH_CLAUDE_CLIENT_ID",
    defaultId: "global-server-mcp-claude",
    clientName: "Claude Custom Connectors",
    redirectUris: [CLAUDE_OAUTH_REDIRECT],
    setupSlug: "claude",
    notes:
      "Paste into Claude custom connector (Use your own OAuth client). Leave Client Secret empty. Approve at /oauth/consent with MCP_OAUTH_OPERATOR_KEY.",
  },
  {
    idEnv: "MCP_OAUTH_CHATGPT_CLIENT_ID",
    defaultId: "global-server-mcp-chatgpt",
    clientName: "ChatGPT Custom MCP",
    redirectUris: [CHATGPT_OAUTH_REDIRECT],
    setupSlug: "chatgpt",
    notes:
      "ChatGPT Plugins → Add custom MCP server. Prefer OAuth; paste Client ID if asked. Leave secret empty. Or leave Client ID blank and use DCR when MCP_OAUTH_ALLOW_DCR=1. Approve at /oauth/consent.",
  },
  {
    idEnv: "MCP_OAUTH_CURSOR_CLIENT_ID",
    defaultId: "global-server-mcp-cursor",
    clientName: "Cursor MCP OAuth",
    redirectUris: [
      CURSOR_DESKTOP_OAUTH_REDIRECT,
      CURSOR_WEB_OAUTH_REDIRECT,
    ],
    setupSlug: "cursor",
    notes:
      "Cursor remote MCP OAuth. Prefer Bearer MCP_API_KEY when possible. Approve at /oauth/consent if OAuth used.",
  },
];

export function knownClientId(c: KnownOAuthClient): string {
  const fromEnv = process.env[c.idEnv]?.trim();
  return fromEnv || c.defaultId;
}

export function allKnownStaticClients(): {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  setupSlug: string;
  notes: string;
}[] {
  return KNOWN_OAUTH_CLIENTS.map((c) => ({
    clientId: knownClientId(c),
    clientName: c.clientName,
    redirectUris: c.redirectUris,
    setupSlug: c.setupSlug,
    notes: c.notes,
  }));
}
