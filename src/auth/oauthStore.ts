import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type PendingAuth = {
  id: string;
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
};

export type CodeRecord = {
  clientId: string;
  params: AuthorizationParams;
  principalId: string;
  createdAt: number;
};

export type TokenRecord = {
  kind: "access" | "refresh";
  clientId: string;
  principalId: string;
  scopes: string[];
  expiresAt: number;
  resource?: string;
  refreshTokenHash?: string;
};

type StoreFile = {
  version: 1;
  pending: Record<string, PendingAuth>;
  codes: Record<string, CodeRecord>;
  tokens: Record<string, TokenRecord>;
};

function emptyStore(): StoreFile {
  return { version: 1, pending: {}, codes: {}, tokens: {} };
}

export function oauthStorePath(): string {
  return resolve(
    process.cwd(),
    process.env.MCP_OAUTH_STORE_PATH || "./data/oauth-store.json"
  );
}

export class DurableOAuthStore {
  private path: string;
  private data: StoreFile;

  constructor(path = oauthStorePath()) {
    this.path = path;
    this.data = this.load();
  }

  private load(): StoreFile {
    try {
      if (!existsSync(this.path)) return emptyStore();
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as StoreFile;
      if (raw?.version !== 1) return emptyStore();
      return {
        version: 1,
        pending: raw.pending || {},
        codes: raw.codes || {},
        tokens: raw.tokens || {},
      };
    } catch {
      return emptyStore();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  reload(): void {
    this.data = this.load();
  }

  putPending(pending: PendingAuth): void {
    this.purgeExpired();
    this.data.pending[pending.id] = pending;
    this.persist();
  }

  getPending(id: string): PendingAuth | undefined {
    this.purgeExpired();
    return this.data.pending[id];
  }

  deletePending(id: string): void {
    delete this.data.pending[id];
    this.persist();
  }

  putCode(code: string, record: CodeRecord): void {
    this.data.codes[code] = record;
    this.persist();
  }

  getCode(code: string): CodeRecord | undefined {
    return this.data.codes[code];
  }

  deleteCode(code: string): void {
    delete this.data.codes[code];
    this.persist();
  }

  putToken(rawToken: string, record: TokenRecord): void {
    this.data.tokens[hashToken(rawToken)] = record;
    this.persist();
  }

  getToken(rawToken: string): TokenRecord | undefined {
    return this.data.tokens[hashToken(rawToken)];
  }

  deleteToken(rawToken: string): void {
    delete this.data.tokens[hashToken(rawToken)];
    this.persist();
  }

  deleteTokenHash(tokenHash: string): void {
    delete this.data.tokens[tokenHash];
    this.persist();
  }

  /** Revoke access + linked refresh (or refresh alone). */
  revoke(rawToken: string): void {
    const hash = hashToken(rawToken);
    const rec = this.data.tokens[hash];
    if (!rec) return;
    delete this.data.tokens[hash];
    if (rec.kind === "access" && rec.refreshTokenHash) {
      delete this.data.tokens[rec.refreshTokenHash];
    }
    if (rec.kind === "refresh") {
      for (const [h, t] of Object.entries(this.data.tokens)) {
        if (t.refreshTokenHash === hash) delete this.data.tokens[h];
      }
    }
    this.persist();
  }

  private purgeExpired(): void {
    const now = Date.now();
    const pendingTtl = 10 * 60_000;
    let changed = false;
    for (const [id, p] of Object.entries(this.data.pending)) {
      if (now - p.createdAt > pendingTtl) {
        delete this.data.pending[id];
        changed = true;
      }
    }
    for (const [code, c] of Object.entries(this.data.codes)) {
      if (now - c.createdAt > pendingTtl) {
        delete this.data.codes[code];
        changed = true;
      }
    }
    for (const [h, t] of Object.entries(this.data.tokens)) {
      if (t.expiresAt < now) {
        delete this.data.tokens[h];
        changed = true;
      }
    }
    if (changed) this.persist();
  }
}

let singleton: DurableOAuthStore | null = null;

export function getOAuthStore(): DurableOAuthStore {
  if (!singleton) singleton = new DurableOAuthStore();
  return singleton;
}

/** Test helper */
export function resetOAuthStoreForTests(path?: string): DurableOAuthStore {
  singleton = new DurableOAuthStore(path || oauthStorePath());
  return singleton;
}
