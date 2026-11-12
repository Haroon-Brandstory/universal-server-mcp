const hits = new Map<string, number[]>();
const locks = new Map<string, string>();
/** Verified backup tokens: connectionId -> backupVerifiedId */
const backupVerified = new Map<string, { id: string; at: number }>();

export function checkDbRate(connectionId: string, perMin: number): void {
  const limit = Math.max(1, perMin || 3);
  const now = Date.now();
  const key = `dbops:${connectionId}`;
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= limit) {
    const oldest = arr[0];
    hits.set(key, arr);
    throw new Error(
      `Database migration rate limit exceeded; retry in ${60_000 - (now - oldest)}ms`
    );
  }
  arr.push(now);
  hits.set(key, arr);
}

export function acquireDbLock(connectionId: string, opId: string): void {
  const cur = locks.get(connectionId);
  if (cur) {
    throw new Error(
      `Concurrent DB operation denied on ${connectionId}; in progress: ${cur}`
    );
  }
  locks.set(connectionId, opId);
}

export function releaseDbLock(connectionId: string, opId: string): void {
  if (locks.get(connectionId) === opId) locks.delete(connectionId);
}

export function markBackupVerified(
  connectionId: string,
  backupVerifiedId: string
): void {
  backupVerified.set(connectionId, {
    id: backupVerifiedId,
    at: Date.now(),
  });
}

export function assertBackupVerified(
  connectionId: string,
  backupVerifiedId: string,
  maxAgeMs = 60 * 60_000
): void {
  const rec = backupVerified.get(connectionId);
  if (!rec || rec.id !== backupVerifiedId) {
    throw new Error(
      "Backup not verified for connection; call db.backup.status and include backupVerifiedId on approval"
    );
  }
  if (Date.now() - rec.at > maxAgeMs) {
    throw new Error("Backup verification expired; re-check db.backup.status");
  }
}

export function resetDbControlsForTests(): void {
  hits.clear();
  locks.clear();
  backupVerified.clear();
}
