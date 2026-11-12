const hits = new Map<string, number[]>();
const locks = new Map<string, string>();

export function checkMaintenanceRate(
  serverId: string,
  perMin: number
): void {
  const limit = Math.max(1, perMin || 5);
  const now = Date.now();
  const key = `serverops:${serverId}`;
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= limit) {
    const oldest = arr[0];
    hits.set(key, arr);
    throw new Error(
      `Server maintenance rate limit exceeded; retry in ${60_000 - (now - oldest)}ms`
    );
  }
  arr.push(now);
  hits.set(key, arr);
}

export function acquireServerLock(serverId: string, opId: string): void {
  const cur = locks.get(serverId);
  if (cur) {
    throw new Error(
      `Concurrent operation denied on ${serverId}; in progress: ${cur}`
    );
  }
  locks.set(serverId, opId);
}

export function releaseServerLock(serverId: string, opId: string): void {
  if (locks.get(serverId) === opId) locks.delete(serverId);
}

export function resetServerControlsForTests(): void {
  locks.clear();
  hits.clear();
}
