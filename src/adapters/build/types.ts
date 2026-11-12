export type TaskKind = "install" | "build" | "test" | "lint" | "typecheck";

export interface CuratedTask {
  id: string;
  kind: TaskKind;
  label: string;
  /** Container image used by docker runner. */
  image: string;
  /** Argv only — never a shell string. */
  argv: string[];
  networkRequired?: boolean;
  /** Marks package-install style tasks. */
  isInstall?: boolean;
}

export interface StackEvidence {
  file: string;
  detail: string;
}

export interface StackDetection {
  language: string;
  framework?: string;
  packageManager?: string;
  runtimeHint?: string;
  confidence: number;
  evidence: StackEvidence[];
  suggestedTasks: CuratedTask[];
  detectorId: string;
}

export interface DetectContext {
  root: string;
  /** Relative paths that exist under root (capped). */
  files: Set<string>;
  readText: (relPath: string, maxBytes?: number) => string | null;
  readJson: <T = unknown>(relPath: string) => T | null;
}

export interface StackDetector {
  id: string;
  detect(ctx: DetectContext): StackDetection | null;
}

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timeout";

export interface BuildJobSpec {
  jobId: string;
  principalId: string;
  projectId: string;
  task: CuratedTask;
  /** Isolated copy of project for this job. */
  workspaceDir: string;
  network: "none" | "allowlist";
  networkAllowlist: string[];
  cpu: string;
  memoryMb: number;
  timeoutSec: number;
  maxLogBytes: number;
}

export interface BuildJobResult {
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  logText: string;
  durationMs: number;
}

export interface BuildRunner {
  readonly kind: "docker" | "process" | "mock";
  run(spec: BuildJobSpec, signal: AbortSignal): Promise<BuildJobResult>;
}
