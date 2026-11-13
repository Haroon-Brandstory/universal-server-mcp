import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PolicyDocument, Principal } from "../../types.js";
import { redactText } from "../../security/redact.js";
import type { BuildJobSpec, BuildRunner, CuratedTask, JobStatus } from "./types.js";
import { createBuildRunner } from "./runner/index.js";
import { resolveProjectWorkspace } from "./project.js";
import { detectStack } from "./detect/registry.js";
import { taskById } from "./tasks.js";
import {
  consumeBuildApproval,
  createBuildApproval,
} from "./approval.js";

export type StoredJob = {
  id: string;
  principalId: string;
  projectId: string;
  taskId: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  logPath: string;
  workspaceDir: string;
  error?: string;
  durationMs?: number;
};

const jobs = new Map<string, StoredJob>();
const controllers = new Map<string, AbortController>();
/** Prevent concurrent builds writing same project source copy key */
const projectLocks = new Map<string, string>();

function workRoot(policy: PolicyDocument): string {
  return resolve(
    process.cwd(),
    policy.build?.work_root ||
      process.env.MCP_BUILD_WORK_ROOT ||
      "./data/build-workspaces"
  );
}

function lockKey(principalId: string, projectId: string): string {
  return `${principalId}::${projectId}`;
}

function assertNotLocked(principalId: string, projectId: string): void {
  const key = lockKey(principalId, projectId);
  const holder = projectLocks.get(key);
  if (holder) {
    throw new Error(
      `Concurrent build denied: project ${projectId} already has running job ${holder}`
    );
  }
}

function maxJobs(policy: PolicyDocument): number {
  return policy.build?.max_concurrent_jobs_per_principal ?? 2;
}

function countRunning(principalId: string): number {
  let n = 0;
  for (const j of jobs.values()) {
    if (j.principalId === principalId && (j.status === "running" || j.status === "queued")) {
      n++;
    }
  }
  return n;
}

function copyWorkspace(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const base = path.split(/[/\\]/).pop() || "";
      if (
        base === "node_modules" ||
        base === ".git" ||
        base === "vendor" ||
        base === ".venv" ||
        base === "dist" ||
        base === ".next"
      ) {
        return false;
      }
      return true;
    },
  });
}

function cleanupJobWorkspace(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function createApproval(
  principal: Principal,
  projectId: string,
  args: Record<string, unknown>
) {
  return createBuildApproval({
    principalId: principal.id,
    projectId,
    actions: Array.isArray(args.actions)
      ? (args.actions.map(String) as Array<"network" | "install" | "execute">)
      : undefined,
    summary: args.summary ? String(args.summary) : undefined,
    ttlMs: args.ttlMs ? Number(args.ttlMs) : undefined,
    uses: args.uses ? Number(args.uses) : undefined,
  });
}

export function detect(policy: PolicyDocument, principal: Principal, projectId: string) {
  const { root, build, project } = resolveProjectWorkspace(
    policy,
    principal,
    projectId
  );
  const detected = detectStack(root);
  return {
    projectId: project.id,
    root,
    configured: build,
    detection: detected.primary,
    candidates: detected.candidates.map((c) => ({
      detectorId: c.detectorId,
      language: c.language,
      framework: c.framework,
      confidence: c.confidence,
      evidence: c.evidence,
    })),
  };
}

export function listTasks(
  policy: PolicyDocument,
  principal: Principal,
  projectId: string
) {
  const { root, build } = resolveProjectWorkspace(policy, principal, projectId);
  const detected = detectStack(root).primary;
  let tasks = detected?.suggestedTasks || [];

  if (build.approved_tasks?.length) {
    const allow = new Set(build.approved_tasks);
    tasks = tasks.filter((t) => allow.has(t.id));
  }
  if (build.language || build.framework) {
    // configured metadata is advisory; detection still drives task list
  }

  return {
    projectId,
    language: build.language || detected?.language,
    framework: build.framework || detected?.framework,
    packageManager: build.package_manager || detected?.packageManager,
    tasks: tasks.map((t) => ({
      id: t.id,
      kind: t.kind,
      label: t.label,
      networkRequired: Boolean(t.networkRequired),
      isInstall: Boolean(t.isInstall),
      argv: t.argv,
      image: t.image,
    })),
  };
}

function resolveTask(
  policy: PolicyDocument,
  principal: Principal,
  projectId: string,
  taskId: string,
  kindFilter?: CuratedTask["kind"]
): { task: CuratedTask; root: string; build: ReturnType<typeof resolveProjectWorkspace>["build"] } {
  const listed = listTasks(policy, principal, projectId);
  const allowedIds = new Set(listed.tasks.map((t) => t.id));
  if (!allowedIds.has(taskId)) {
    throw new Error(`Task not approved for project: ${taskId}`);
  }
  const task = taskById(taskId);
  if (!task) throw new Error(`Unknown curated task: ${taskId}`);
  if (kindFilter && task.kind !== kindFilter) {
    throw new Error(`Task ${taskId} is not a ${kindFilter} task`);
  }
  if (kindFilter === "test") {
    const { build } = resolveProjectWorkspace(policy, principal, projectId);
    if (build.approved_test_tasks?.length && !build.approved_test_tasks.includes(taskId)) {
      throw new Error(`Test task not in approved_test_tasks: ${taskId}`);
    }
  }
  const { root, build } = resolveProjectWorkspace(policy, principal, projectId);
  return { task, root, build };
}

function requireApprovals(
  policy: PolicyDocument,
  principal: Principal,
  projectId: string,
  task: CuratedTask,
  build: ReturnType<typeof resolveProjectWorkspace>["build"],
  approvalId: unknown
): void {
  const needNetwork =
    Boolean(task.networkRequired) &&
    (build.network === "allowlist" || build.require_approval_for_network !== false);
  const needInstall =
    Boolean(task.isInstall) && build.require_approval_for_install !== false;

  // Always require approval for network/install; execute approval optional unless policy says
  if (!needNetwork && !needInstall) {
    // Non-network curated test/lint still executes code — require execute approval when write tools used
    // Conservative: require approvalId for all write build tools when require_approval_for_install default
    // Actually user asked no unapproved network/install. For plain test without network, allow without approval if network none.
    if (!task.networkRequired && !task.isInstall) return;
  }

  const id = String(approvalId || "");
  if (!id) {
    throw new Error(
      "approvalId required for this build task (network/install). Use an admin approval flow or grant via policy tooling."
    );
  }

  if (needInstall) {
    consumeBuildApproval({
      approvalId: id,
      principalId: principal.id,
      projectId,
      action: "install",
    });
  } else if (needNetwork) {
    consumeBuildApproval({
      approvalId: id,
      principalId: principal.id,
      projectId,
      action: "network",
    });
  } else {
    consumeBuildApproval({
      approvalId: id,
      principalId: principal.id,
      projectId,
      action: "execute",
    });
  }
  void policy;
}

export async function startJob(
  policy: PolicyDocument,
  principal: Principal,
  args: {
    projectId: string;
    taskId: string;
    kindFilter?: CuratedTask["kind"];
    approvalId?: unknown;
  }
): Promise<StoredJob> {
  if (policy.build?.enabled === false) {
    throw new Error("BuildOps disabled in policy");
  }
  if (countRunning(principal.id) >= maxJobs(policy)) {
    throw new Error("Too many concurrent build jobs for principal");
  }

  const projectId = args.projectId;
  assertNotLocked(principal.id, projectId);

  const { task, root, build } = resolveTask(
    policy,
    principal,
    projectId,
    args.taskId,
    args.kindFilter
  );

  // Default network none
  const network = build.network || "none";
  if (task.networkRequired && network === "none") {
    throw new Error(
      `Task ${task.id} requires network but project build.network is none. Set network: allowlist + approval.`
    );
  }

  requireApprovals(
    policy,
    principal,
    projectId,
    task,
    build,
    args.approvalId
  );

  const jobId = randomUUID();
  const ws = join(workRoot(policy), principal.id, jobId);
  copyWorkspace(root, ws);

  const logPath = join(ws, "build.log");
  const job: StoredJob = {
    id: jobId,
    principalId: principal.id,
    projectId,
    taskId: task.id,
    status: "queued",
    createdAt: new Date().toISOString(),
    logPath,
    workspaceDir: ws,
  };
  jobs.set(jobId, job);
  projectLocks.set(lockKey(principal.id, projectId), jobId);

  const controller = new AbortController();
  controllers.set(jobId, controller);

  const limits = build.resource_limits || {};
  const spec: BuildJobSpec = {
    jobId,
    principalId: principal.id,
    projectId,
    task,
    workspaceDir: ws,
    network: task.networkRequired ? network : "none",
    networkAllowlist: build.network_allowlist || [],
    cpu: limits.cpu || policy.build?.default_cpu || "1.0",
    memoryMb: limits.memory_mb || policy.build?.default_memory_mb || 512,
    timeoutSec: limits.timeout_sec || policy.build?.default_timeout_sec || 120,
    maxLogBytes: limits.max_log_bytes || 256_000,
  };

  // fire and forget
  void (async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    let runner: BuildRunner;
    try {
      runner = createBuildRunner(policy);
      const result = await runner.run(spec, controller.signal);
      const safeLog = redactText(result.logText, spec.maxLogBytes);
      writeFileSync(logPath, safeLog, "utf8");
      job.exitCode = result.exitCode;
      job.durationMs = result.durationMs;
      job.finishedAt = new Date().toISOString();
      if (result.cancelled) job.status = "cancelled";
      else if (result.timedOut) job.status = "timeout";
      else if (result.exitCode === 0) job.status = "succeeded";
      else job.status = "failed";
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date().toISOString();
      try {
        writeFileSync(logPath, job.error, "utf8");
      } catch {
        /* ignore */
      }
    } finally {
      projectLocks.delete(lockKey(principal.id, projectId));
      controllers.delete(jobId);
      // cleanup workspace after short delay so logs can be read
      setTimeout(() => cleanupJobWorkspace(ws), 60_000).unref?.();
    }
  })();

  return { ...job };
}

export function getJob(principalId: string, jobId: string): StoredJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Unknown build job: ${jobId}`);
  if (job.principalId !== principalId) {
    throw new Error("Build job access denied: principal mismatch");
  }
  return { ...job };
}

export function getJobLogs(
  principalId: string,
  jobId: string,
  maxBytes = 64_000
): { jobId: string; status: JobStatus; log: string } {
  const job = getJob(principalId, jobId);
  let log = "";
  if (existsSync(job.logPath)) {
    log = readFileSync(job.logPath, "utf8");
  } else if (job.error) {
    log = job.error;
  }
  log = redactText(log, maxBytes);
  return { jobId, status: job.status, log };
}

export function cancelJob(principalId: string, jobId: string): StoredJob {
  const job = getJob(principalId, jobId);
  const c = controllers.get(jobId);
  if (c) c.abort();
  if (job.status === "running" || job.status === "queued") {
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
  }
  return { ...job };
}

export function resetBuildJobsForTests(): void {
  for (const c of controllers.values()) c.abort();
  controllers.clear();
  projectLocks.clear();
  for (const j of jobs.values()) {
    cleanupJobWorkspace(j.workspaceDir);
  }
  jobs.clear();
}
