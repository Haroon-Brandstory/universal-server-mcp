export type Capability =
  | "http.request"
  | "page.navigate"
  | "page.snapshot"
  | "page.click"
  | "page.fill"
  | "page.wait"
  | "session.create"
  | "session.close"
  | "policy.explain"
  | "audit.tail"
  | "code.list"
  | "code.read"
  | "code.write"
  | "code.edit"
  | "code.search"
  | "git.repo.list"
  | "git.repo.info"
  | "git.branch.list"
  | "git.branch.create"
  | "git.file.read"
  | "git.diff"
  | "git.commit"
  | "git.pr.create"
  | "git.pr.status"
  | "git.ci.status"
  | "git.approval.create"
  | "build.detect_stack"
  | "build.list_tasks"
  | "build.run"
  | "build.status"
  | "build.logs"
  | "build.test"
  | "build.lint"
  | "build.typecheck"
  | "build.cancel"
  | "build.approval.create"
  | "server.list"
  | "server.health"
  | "server.metrics"
  | "server.services"
  | "server.service.status"
  | "server.logs.read"
  | "server.ssl.status"
  | "server.disk.status"
  | "server.processes"
  | "server.security.status"
  | "server.service.restart"
  | "server.cache.clear"
  | "server.maintenance.run"
  | "server.approval.create"
  | "db.connections"
  | "db.health"
  | "db.schemas"
  | "db.tables"
  | "db.table.describe"
  | "db.query.read"
  | "db.performance"
  | "db.indexes"
  | "db.migration.plan"
  | "db.migration.validate"
  | "db.migration.apply"
  | "db.backup.status"
  | "db.restore.plan"
  | "db.approval.create"
  | "security.scan.code"
  | "security.scan.dependencies"
  | "security.scan.secrets"
  | "security.scan.container"
  | "security.audit.server"
  | "security.audit.headers"
  | "security.audit.tls"
  | "security.findings"
  | "security.remediation.plan"
  | "deploy.projects"
  | "deploy.environments"
  | "deploy.history"
  | "deploy.plan"
  | "deploy.validate"
  | "deploy.staging"
  | "deploy.status"
  | "deploy.production.request"
  | "deploy.rollback.plan"
  | "deploy.rollback.request"
  | "deploy.approval.create"
  | "platform.info"
  | "platform.projects"
  | "platform.metrics";

/** read = observe; write = mutate/execute; admin = audit/meta privileged */
export type CapabilityClass = "read" | "write" | "admin";

export type PolicyEnvironment = "development" | "staging" | "production";

export type BuildNetworkMode = "none" | "allowlist";

export type BuildPackageManager =
  | "npm"
  | "pnpm"
  | "yarn"
  | "pip"
  | "composer"
  | "go"
  | "maven"
  | "gradle"
  | "dotnet"
  | "none";

export interface BuildResourceLimits {
  cpu?: string;
  memory_mb?: number;
  timeout_sec?: number;
  max_log_bytes?: number;
}

/** Per-project BuildOps declaration (optional; detection fills gaps). */
export interface BuildProjectConfig {
  language?: string;
  framework?: string;
  runtime_version?: string;
  package_manager?: BuildPackageManager;
  /** Explicit allowlist of curated task ids (e.g. node.test, python.pytest). */
  approved_tasks?: string[];
  approved_test_tasks?: string[];
  network?: BuildNetworkMode;
  network_allowlist?: string[];
  resource_limits?: BuildResourceLimits;
  /** Must resolve under project allow_paths when set. */
  workspace_path?: string;
  require_approval_for_network?: boolean;
  require_approval_for_install?: boolean;
}

export interface ProjectHealthCheck {
  url: string;
  expect_status?: number;
}

/** Universal project registry entry (config-driven; no gateway core edits). */
export interface ProjectScope {
  id: string;
  name?: string;
  description?: string;
  allow_hosts?: string[];
  allow_paths?: string[];
  /** GitHub repos as owner/name (GitOps). */
  github_repos?: string[];
  build?: BuildProjectConfig;
  /** Stack profile id from config/stack-profiles.yaml */
  stack_profile?: string;
  /** Associations to other registries (ids only). */
  server_ids?: string[];
  database_ids?: string[];
  deploy_project_id?: string;
  security_target_ids?: string[];
  health_checks?: ProjectHealthCheck[];
  /** OAuth client ids / principal ids allowed to touch this project. */
  authorized_clients?: string[];
  environments?: PolicyEnvironment[];
}

export interface OAuthPolicy {
  allowed_redirect_uris: string[];
  default_principal_id: string;
  client_principal_map?: Record<string, string>;
  allow_dynamic_registration?: boolean;
}

export interface GitHubPolicy {
  deny_commit_branches?: string[];
  feature_branch_pattern?: string;
  require_write_approval?: boolean;
}

export interface BuildPolicy {
  enabled?: boolean;
  /** docker = preferred isolation; process = local sandbox (dev/test only). */
  runner?: "docker" | "process";
  /** Explicit opt-in for process runner (never default in production). */
  allow_process_runner?: boolean;
  work_root?: string;
  default_timeout_sec?: number;
  default_memory_mb?: number;
  default_cpu?: string;
  max_concurrent_jobs_per_principal?: number;
}

export interface ServerOpsPolicy {
  enabled?: boolean;
  /** Path to servers registry YAML. */
  servers_path?: string;
  require_maintenance_approval?: boolean;
  maintenance_rate_limit_per_min?: number;
  default_timeout_sec?: number;
  max_log_bytes?: number;
}

export interface DatabaseOpsPolicy {
  enabled?: boolean;
  /** Path to databases registry YAML. */
  databases_path?: string;
  require_migration_approval?: boolean;
  require_backup_before_destructive?: boolean;
  /** Never allow migration.apply when policy.environment is production unless true. */
  allow_production_migrations?: boolean;
  default_statement_timeout_ms?: number;
  default_max_rows?: number;
  default_max_result_bytes?: number;
  migration_rate_limit_per_min?: number;
}

export interface SecurityOpsPolicy {
  enabled?: boolean;
  /** Path to security targets registry YAML. */
  targets_path?: string;
  /** Allow any non-passive scan against production targets. Default false. */
  allow_production_scans?: boolean;
  max_findings_per_scan?: number;
  scanner_timeout_sec?: number;
  /** Prefer mock scanners (tests/CI). */
  force_mock_scanners?: boolean;
  findings_path?: string;
}

export interface DeployOpsPolicy {
  enabled?: boolean;
  deployments_path?: string;
  history_path?: string;
  /** When false (default), production provider dispatch is never executed. */
  allow_production_dispatch?: boolean;
  force_mock_providers?: boolean;
  require_ci_green?: boolean;
  require_security_gate?: boolean;
  approval_ttl_ms?: number;
  health_timeout_ms?: number;
}

export interface PlatformPolicy {
  /** Path to universal projects registry YAML. */
  projects_path?: string;
  stack_profiles_path?: string;
  /** Emergency: principal ids denied even with valid key. */
  revoked_principal_ids?: string[];
  metrics_enabled?: boolean;
}

export interface Principal {
  id: string;
  api_key_env?: string;
  api_key?: string;
  roles: string[];
  projects?: string[];
  allow_hosts: string[];
  allow_paths?: string[];
  allow_repos?: string[];
  capabilities: Capability[];
  allow_methods: string[];
  write: boolean;
  admin?: boolean;
  oauth_allowed?: boolean;
  oauth_operator?: boolean;
  /** Human deploy approver — cannot approve own deploy requests. */
  deploy_approver?: boolean;
  max_response_bytes: number;
}

export interface SsrfConfig {
  block_private: boolean;
  block_loopback: boolean;
  block_link_local: boolean;
  block_metadata: boolean;
}

export interface PolicyDocument {
  version: number;
  environment?: PolicyEnvironment;
  kill_switch: boolean;
  rate_limit_per_min: number;
  projects?: ProjectScope[];
  principals: Principal[];
  deny_hosts: string[];
  ssrf: SsrfConfig;
  oauth?: OAuthPolicy;
  github?: GitHubPolicy;
  build?: BuildPolicy;
  serverops?: ServerOpsPolicy;
  databaseops?: DatabaseOpsPolicy;
  securityops?: SecurityOpsPolicy;
  deployops?: DeployOpsPolicy;
  platform?: PlatformPolicy;
}

export interface AuthContext {
  principal: Principal;
  sessionId: string;
}

export interface AuditEvent {
  ts: string;
  sessionId: string;
  principalId: string;
  tool: string;
  decision: "allow" | "deny";
  reason?: string;
  target?: string;
  meta?: Record<string, unknown>;
}
