/** Serialize conflicting deploys per project+environment. */
const locks = new Map<string, string>();

function key(projectId: string, environment: string): string {
  return `${projectId}::${environment}`;
}

export function acquireDeployLock(
  projectId: string,
  environment: string,
  opId: string
): void {
  const k = key(projectId, environment);
  const cur = locks.get(k);
  if (cur) {
    throw new Error(
      `Conflicting deployment in progress for ${projectId}/${environment}: ${cur}`
    );
  }
  locks.set(k, opId);
}

export function releaseDeployLock(
  projectId: string,
  environment: string,
  opId: string
): void {
  const k = key(projectId, environment);
  if (locks.get(k) === opId) locks.delete(k);
}

export function resetDeployControlsForTests(): void {
  locks.clear();
}
