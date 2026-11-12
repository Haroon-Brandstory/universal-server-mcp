import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";

export interface BrowserSession {
  id: string;
  principalId: string;
  browser: Browser;
  page: Page;
  createdAt: number;
}

export class SessionManager {
  private sessions = new Map<string, BrowserSession>();
  private killed = false;

  kill(): void {
    this.killed = true;
  }

  isKilled(): boolean {
    return this.killed;
  }

  async create(principalId: string): Promise<BrowserSession> {
    if (this.killed) throw new Error("Kill switch: sessions disabled");
    if (!principalId) throw new Error("principalId required");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const session: BrowserSession = {
      id: randomUUID(),
      principalId,
      browser,
      page,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Return session only if owned by principalId. */
  get(id: string, principalId: string): BrowserSession {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Unknown browser session: ${id}`);
    if (s.principalId !== principalId) {
      throw new Error("Browser session access denied: principal mismatch");
    }
    return s;
  }

  async close(id: string, principalId: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    if (s.principalId !== principalId) {
      throw new Error("Browser session access denied: principal mismatch");
    }
    await s.browser.close().catch(() => undefined);
    this.sessions.delete(id);
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      const s = this.sessions.get(id);
      if (!s) continue;
      await s.browser.close().catch(() => undefined);
      this.sessions.delete(id);
    }
  }

  /** Test helper — register a fake session without Playwright. */
  _registerForTests(session: BrowserSession): void {
    this.sessions.set(session.id, session);
  }
}
