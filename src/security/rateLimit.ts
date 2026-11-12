export class RateLimiter {
  private readonly windowMs = 60_000;
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly limitPerMin: number) {}

  /** Key should include principal id (and optionally session) to prevent churn bypass. */
  check(key: string): { ok: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limitPerMin) {
      const oldest = arr[0];
      this.hits.set(key, arr);
      return { ok: false, retryAfterMs: this.windowMs - (now - oldest) };
    }
    arr.push(now);
    this.hits.set(key, arr);
    return { ok: true };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
