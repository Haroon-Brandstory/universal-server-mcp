import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "policy.explain",
    description:
      "Explain whether a capability/host/method would be allowed for the current principal. Default-deny policy.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string" },
        host: { type: "string" },
        method: { type: "string" },
      },
    },
  },
  {
    name: "audit.tail",
    description: "Return the latest audit log events (redacted decisions).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, maximum: 200 },
      },
    },
  },
  {
    name: "session.create",
    description: "Create an isolated headless browser session. Returns sessionId.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "session.close",
    description: "Close a browser session.",
    inputSchema: {
      type: "object",
      required: ["sessionId"],
      properties: { sessionId: { type: "string" } },
    },
  },
  {
    name: "http.request",
    description:
      "Policy-gated HTTP request. Host/method must be allowlisted. SSRF guard + response redaction applied. No automatic redirect follow.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"] },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string" },
      },
    },
  },
  {
    name: "page.navigate",
    description: "Navigate browser session to an allowlisted URL.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "url"],
      properties: {
        sessionId: { type: "string" },
        url: { type: "string" },
      },
    },
  },
  {
    name: "page.snapshot",
    description: "Accessibility/text snapshot of current page (PII-redacted, size-capped).",
    inputSchema: {
      type: "object",
      required: ["sessionId"],
      properties: { sessionId: { type: "string" } },
    },
  },
  {
    name: "page.click",
    description: "Click first element matching CSS selector.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "selector"],
      properties: {
        sessionId: { type: "string" },
        selector: { type: "string" },
      },
    },
  },
  {
    name: "page.fill",
    description: "Fill an input/textarea matching CSS selector.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "selector", "value"],
      properties: {
        sessionId: { type: "string" },
        selector: { type: "string" },
        value: { type: "string" },
      },
    },
  },
  {
    name: "page.wait",
    description: "Wait for selector or text to appear.",
    inputSchema: {
      type: "object",
      required: ["sessionId"],
      properties: {
        sessionId: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "code.list",
    description:
      "List files in a directory under principal allow_paths (CodeOps).",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "code.read",
    description: "Read a text file under allow_paths (secrets blocked).",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "code.write",
    description:
      "Overwrite/create a text file under allow_paths. Requires principal write=true.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
    },
  },
  {
    name: "code.edit",
    description:
      "Surgical edit: replace oldString with newString in a file under allow_paths.",
    inputSchema: {
      type: "object",
      required: ["path", "oldString", "newString"],
      properties: {
        path: { type: "string" },
        oldString: { type: "string" },
        newString: { type: "string" },
        replaceAll: { type: "boolean" },
      },
    },
  },
  {
    name: "code.search",
    description: "Search text under a root path (skips node_modules/.git/.next).",
    inputSchema: {
      type: "object",
      required: ["path", "query"],
      properties: {
        path: { type: "string" },
        query: { type: "string" },
        maxHits: { type: "number" },
      },
    },
  },
  {
    name: "git.repo.list",
    description:
      "List GitHub repositories allowed for this principal (project-scoped).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "git.repo.info",
    description:
      "Repository metadata, default-branch protection summary, recent commits. No secrets.",
    inputSchema: {
      type: "object",
      required: ["repo"],
      properties: {
        repo: { type: "string", description: "owner/name" },
        commitLimit: { type: "number" },
      },
    },
  },
  {
    name: "git.branch.list",
    description: "List branches for an allowed repository.",
    inputSchema: {
      type: "object",
      required: ["repo"],
      properties: {
        repo: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "git.branch.create",
    description:
      "Create a feature branch from a base ref. Requires write + approvalId. No force.",
    inputSchema: {
      type: "object",
      required: ["repo", "name", "approvalId"],
      properties: {
        repo: { type: "string" },
        name: { type: "string", description: "feat|fix|chore|…/…" },
        from: { type: "string" },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "git.file.read",
    description: "Read a file or list a directory from a repo ref via GitHub API.",
    inputSchema: {
      type: "object",
      required: ["repo", "path"],
      properties: {
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "git.diff",
    description: "Compare two refs (files + patches). Flags likely merge divergence.",
    inputSchema: {
      type: "object",
      required: ["repo", "base", "head"],
      properties: {
        repo: { type: "string" },
        base: { type: "string" },
        head: { type: "string" },
      },
    },
  },
  {
    name: "git.commit",
    description:
      "Commit file create/updates on a feature branch only. Requires approvalId. Never force-push; never commit to main/master/production or protected branches.",
    inputSchema: {
      type: "object",
      required: ["repo", "branch", "message", "files", "approvalId"],
      properties: {
        repo: { type: "string" },
        branch: { type: "string" },
        message: { type: "string" },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
        },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "git.pr.create",
    description:
      "Open a pull request (no merge). Requires approvalId. Head must be a feature branch.",
    inputSchema: {
      type: "object",
      required: ["repo", "title", "head", "approvalId"],
      properties: {
        repo: { type: "string" },
        title: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        body: { type: "string" },
        draft: { type: "boolean" },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "git.pr.status",
    description:
      "PR state, reviews, mergeable/conflict signals. Never merges.",
    inputSchema: {
      type: "object",
      required: ["repo", "number"],
      properties: {
        repo: { type: "string" },
        number: { type: "number" },
      },
    },
  },
  {
    name: "git.ci.status",
    description: "Check runs + combined commit status for a ref or PR head.",
    inputSchema: {
      type: "object",
      required: ["repo"],
      properties: {
        repo: { type: "string" },
        ref: { type: "string" },
        number: { type: "number", description: "PR number → use head SHA" },
      },
    },
  },
  {
    name: "approvals.list",
    description:
      "List unused git/build/server/db/deploy approvals (pending or operator-approved). After creating an approval, tell the human to open /operators, approve with MCP_OPERATOR_TOKEN, then say approved — never invent the operator token.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "git.approval.create",
    description:
      "Request a short-lived write approval for branch/commit/PR on one repo. Returns status pending until a human approves at /operators with MCP_OPERATOR_TOKEN. Then tell the agent to proceed with approvalId. AI cannot self-approve.",
    inputSchema: {
      type: "object",
      required: ["repo"],
      properties: {
        repo: { type: "string" },
        summary: {
          type: "string",
          description: "Human-readable reason shown on /operators",
        },
        actions: {
          type: "array",
          items: {
            type: "string",
            enum: ["git.branch.create", "git.commit", "git.pr.create"],
          },
        },
        ttlMs: { type: "number" },
        uses: { type: "number" },
      },
    },
  },
  {
    name: "build.detect_stack",
    description:
      "Detect language/framework via manifests (extensible detectors). Project-scoped.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" } },
    },
  },
  {
    name: "build.list_tasks",
    description:
      "List curated approved build/test/lint/typecheck tasks for a project (no free-form shell).",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" } },
    },
  },
  {
    name: "build.run",
    description:
      "Run a curated task id in an isolated workspace (docker preferred). Network/install need approvalId.",
    inputSchema: {
      type: "object",
      required: ["projectId", "taskId"],
      properties: {
        projectId: { type: "string" },
        taskId: { type: "string" },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "build.test",
    description: "Run a curated test task in isolation.",
    inputSchema: {
      type: "object",
      required: ["projectId", "taskId"],
      properties: {
        projectId: { type: "string" },
        taskId: { type: "string" },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "build.lint",
    description: "Run a curated lint task in isolation.",
    inputSchema: {
      type: "object",
      required: ["projectId", "taskId"],
      properties: {
        projectId: { type: "string" },
        taskId: { type: "string" },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "build.typecheck",
    description: "Run a curated typecheck task in isolation.",
    inputSchema: {
      type: "object",
      required: ["projectId", "taskId"],
      properties: {
        projectId: { type: "string" },
        taskId: { type: "string" },
        approvalId: { type: "string" },
      },
    },
  },
  {
    name: "build.status",
    description: "Get status for a build job owned by the current principal.",
    inputSchema: {
      type: "object",
      required: ["jobId"],
      properties: { jobId: { type: "string" } },
    },
  },
  {
    name: "build.logs",
    description: "Fetch redacted/truncated logs for a build job.",
    inputSchema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string" },
        maxBytes: { type: "number" },
      },
    },
  },
  {
    name: "build.cancel",
    description: "Cancel a running/queued build job.",
    inputSchema: {
      type: "object",
      required: ["jobId"],
      properties: { jobId: { type: "string" } },
    },
  },
  {
    name: "build.approval.create",
    description:
      "Request short-lived approval for network/install/execute build tasks. Pending until human approves at /operators; then tell agent to proceed with approvalId.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "string",
            enum: ["network", "install", "execute"],
          },
        },
        ttlMs: { type: "number" },
        uses: { type: "number" },
      },
    },
  },
  {
    name: "server.list",
    description:
      "List authorized VPS/servers for the principal (no secrets/key paths).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "server.health",
    description:
      "Read-only health: uptime, load, service status, allowlisted app health URLs.",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.metrics",
    description: "Read-only CPU/memory/disk metrics snapshot.",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.services",
    description: "Status for all service profiles enabled on the server.",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.service.status",
    description: "Status (+ optional health) for one enabled service profile.",
    inputSchema: {
      type: "object",
      required: ["serverId", "service"],
      properties: {
        serverId: { type: "string" },
        service: { type: "string" },
      },
    },
  },
  {
    name: "server.logs.read",
    description:
      "Sanitized/truncated logs for an enabled service profile (never secrets).",
    inputSchema: {
      type: "object",
      required: ["serverId", "service"],
      properties: {
        serverId: { type: "string" },
        service: { type: "string" },
        name: { type: "string" },
        lines: { type: "number" },
      },
    },
  },
  {
    name: "server.ssl.status",
    description: "SSL status for registry-configured hosts only.",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.disk.status",
    description: "Disk usage snapshot (df).",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.processes",
    description: "Truncated process list (top CPU).",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.security.status",
    description:
      "Coarse security posture checks (ssh/fail2ban/unattended). Read-only.",
    inputSchema: {
      type: "object",
      required: ["serverId"],
      properties: { serverId: { type: "string" } },
    },
  },
  {
    name: "server.service.restart",
    description:
      "Approved restart of an enabled service profile. Needs approvalId + confirmServerId/confirmEnvironment. No arbitrary shell.",
    inputSchema: {
      type: "object",
      required: [
        "serverId",
        "service",
        "approvalId",
        "confirmServerId",
        "confirmEnvironment",
      ],
      properties: {
        serverId: { type: "string" },
        service: { type: "string" },
        name: { type: "string" },
        approvalId: { type: "string" },
        confirmServerId: { type: "string" },
        confirmEnvironment: { type: "string" },
      },
    },
  },
  {
    name: "server.cache.clear",
    description:
      "Approved cache/reload action for a profile that supports it (e.g. nginx reload).",
    inputSchema: {
      type: "object",
      required: [
        "serverId",
        "approvalId",
        "confirmServerId",
        "confirmEnvironment",
      ],
      properties: {
        serverId: { type: "string" },
        service: { type: "string" },
        approvalId: { type: "string" },
        confirmServerId: { type: "string" },
        confirmEnvironment: { type: "string" },
      },
    },
  },
  {
    name: "server.maintenance.run",
    description:
      "Run a predefined maintenance action id only (never free-form shell).",
    inputSchema: {
      type: "object",
      required: [
        "serverId",
        "action",
        "approvalId",
        "confirmServerId",
        "confirmEnvironment",
      ],
      properties: {
        serverId: { type: "string" },
        action: {
          type: "string",
          enum: ["nginx.reload", "pm2.save", "disk.inode.check"],
        },
        approvalId: { type: "string" },
        confirmServerId: { type: "string" },
        confirmEnvironment: { type: "string" },
      },
    },
  },
  {
    name: "server.approval.create",
    description:
      "Request short-lived maintenance approval for one server + environment. Pending until human approves at /operators; then tell agent to proceed with approvalId.",
    inputSchema: {
      type: "object",
      required: ["serverId", "confirmEnvironment"],
      properties: {
        serverId: { type: "string" },
        confirmEnvironment: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "string",
            enum: ["service.restart", "cache.clear", "maintenance.run"],
          },
        },
        ttlMs: { type: "number" },
        uses: { type: "number" },
      },
    },
  },
  {
    name: "db.connections",
    description:
      "List authorized DB connections (env credential refs only — no secrets).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "db.health",
    description: "Read-only connectivity/health check for a connection.",
    inputSchema: {
      type: "object",
      required: ["connectionId"],
      properties: { connectionId: { type: "string" } },
    },
  },
  {
    name: "db.schemas",
    description: "List allowlisted schemas visible on a connection.",
    inputSchema: {
      type: "object",
      required: ["connectionId"],
      properties: { connectionId: { type: "string" } },
    },
  },
  {
    name: "db.tables",
    description: "List tables in an allowlisted schema.",
    inputSchema: {
      type: "object",
      required: ["connectionId", "schema"],
      properties: {
        connectionId: { type: "string" },
        schema: { type: "string" },
      },
    },
  },
  {
    name: "db.table.describe",
    description: "Describe columns for a table in an allowlisted schema.",
    inputSchema: {
      type: "object",
      required: ["connectionId", "schema", "table"],
      properties: {
        connectionId: { type: "string" },
        schema: { type: "string" },
        table: { type: "string" },
      },
    },
  },
  {
    name: "db.query.read",
    description:
      "Parameterized SELECT/WITH only via read identity + READ ONLY transaction. Results redacted/size-limited.",
    inputSchema: {
      type: "object",
      required: ["connectionId", "sql"],
      properties: {
        connectionId: { type: "string" },
        sql: { type: "string" },
        params: { type: "array", items: {} },
      },
    },
  },
  {
    name: "db.performance",
    description: "Coarse DB performance/size stats (no secrets).",
    inputSchema: {
      type: "object",
      required: ["connectionId"],
      properties: { connectionId: { type: "string" } },
    },
  },
  {
    name: "db.indexes",
    description: "List indexes for schema (optional table filter).",
    inputSchema: {
      type: "object",
      required: ["connectionId", "schema"],
      properties: {
        connectionId: { type: "string" },
        schema: { type: "string" },
        table: { type: "string" },
      },
    },
  },
  {
    name: "db.migration.plan",
    description: "List curated migration files for a connection (plan only).",
    inputSchema: {
      type: "object",
      required: ["connectionId"],
      properties: { connectionId: { type: "string" } },
    },
  },
  {
    name: "db.migration.validate",
    description: "Validate one curated migration file (no apply).",
    inputSchema: {
      type: "object",
      required: ["connectionId", "migrationId"],
      properties: {
        connectionId: { type: "string" },
        migrationId: { type: "string" },
      },
    },
  },
  {
    name: "db.migration.apply",
    description:
      "Apply one curated migration file with approval + confirms. Blocked in production unless policy allows. Not free-form SQL.",
    inputSchema: {
      type: "object",
      required: [
        "connectionId",
        "migrationId",
        "approvalId",
        "confirmConnectionId",
        "confirmEnvironment",
      ],
      properties: {
        connectionId: { type: "string" },
        migrationId: { type: "string" },
        approvalId: { type: "string" },
        confirmConnectionId: { type: "string" },
        confirmEnvironment: { type: "string" },
        backupVerifiedId: { type: "string" },
      },
    },
  },
  {
    name: "db.backup.status",
    description:
      "Backup posture check; returns backupVerifiedId for migration approvals.",
    inputSchema: {
      type: "object",
      required: ["connectionId"],
      properties: { connectionId: { type: "string" } },
    },
  },
  {
    name: "db.restore.plan",
    description:
      "Restore plan only — MCP does not execute unrestricted restore SQL.",
    inputSchema: {
      type: "object",
      required: ["connectionId"],
      properties: { connectionId: { type: "string" } },
    },
  },
  {
    name: "db.approval.create",
    description:
      "Request short-lived DB migration/backup/restore approval. Pending until human approves at /operators; then tell agent to proceed with approvalId.",
    inputSchema: {
      type: "object",
      required: ["connectionId", "confirmEnvironment"],
      properties: {
        connectionId: { type: "string" },
        confirmEnvironment: { type: "string" },
        backupVerifiedId: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "string",
            enum: ["migration.apply", "backup", "restore"],
          },
        },
        ttlMs: { type: "number" },
        uses: { type: "number" },
      },
    },
  },
  {
    name: "security.scan.code",
    description:
      "Defensive SAST on authorized project roots (builtin + Semgrep if installed). Unverified ≠ confirmed.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.scan.dependencies",
    description:
      "Dependency advisories via npm audit / OSV-Scanner (mock if tools missing).",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.scan.secrets",
    description:
      "Secret detection on allowlisted roots (builtin + Gitleaks if installed). Evidence redacted.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.scan.container",
    description:
      "Trivy scan of registry-allowlisted images only. No arbitrary image pulls from AI args.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.audit.server",
    description:
      "Passive server hardening audit via registered ServerOps target. No invasive pen-tests; no config mutation.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.audit.headers",
    description: "HTTP security-header inspection for registry http_origins only.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.audit.tls",
    description: "TLS certificate/protocol inspection for registry https origins.",
    inputSchema: {
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } },
    },
  },
  {
    name: "security.findings",
    description:
      "List/filter findings or update verification status (validated/false_positive/…). Cross-project denied.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        findingId: { type: "string" },
        severity: { type: "string" },
        verification: { type: "string" },
        setVerification: {
          type: "string",
          enum: [
            "unverified",
            "validated",
            "false_positive",
            "accepted_risk",
            "fixed",
          ],
        },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "security.remediation.plan",
    description:
      "Propose remediation workflow (GitOps branch → BuildOps test → PR). Never auto-changes prod infra. execute=true needs write + approvals.",
    inputSchema: {
      type: "object",
      required: ["findingId"],
      properties: {
        findingId: { type: "string" },
        validateOnly: { type: "boolean" },
        execute: { type: "boolean" },
        repo: { type: "string" },
        baseBranch: { type: "string" },
        branchName: { type: "string" },
        gitApprovalId: { type: "string" },
        buildApprovalId: { type: "string" },
      },
    },
  },
  {
    name: "deploy.projects",
    description: "List authorized deploy projects (no secrets).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "deploy.environments",
    description: "List environments for a deploy project.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" } },
    },
  },
  {
    name: "deploy.history",
    description: "Immutable deploy/rollback history for authorized projects.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        environment: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "deploy.plan",
    description:
      "End-to-end release plan (GitOps→BuildOps→SecurityOps→PR→approvals→deploy). Plan only.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        environment: { type: "string" },
        commitSha: { type: "string" },
      },
    },
  },
  {
    name: "deploy.validate",
    description:
      "Validate deploy readiness (CI green, security gate, registry, db compat). Refuses CI bypass.",
    inputSchema: {
      type: "object",
      required: ["projectId", "environment", "commitSha"],
      properties: {
        projectId: { type: "string" },
        environment: { type: "string" },
        commitSha: { type: "string" },
        ciGreen: { type: "boolean" },
        securityOk: { type: "boolean" },
        dbCompatOk: { type: "boolean" },
      },
    },
  },
  {
    name: "deploy.staging",
    description:
      "Deploy to staging via registered provider (mock in tests). Requires write + validation gates.",
    inputSchema: {
      type: "object",
      required: ["projectId", "commitSha"],
      properties: {
        projectId: { type: "string" },
        commitSha: { type: "string" },
        ciGreen: { type: "boolean" },
        securityOk: { type: "boolean" },
        dbCompatOk: { type: "boolean" },
      },
    },
  },
  {
    name: "deploy.status",
    description: "Status for a deploy record / provider external id.",
    inputSchema: {
      type: "object",
      required: ["deployId"],
      properties: { deployId: { type: "string" } },
    },
  },
  {
    name: "deploy.production.request",
    description:
      "Request production deploy bound to human approvalId (project/env/SHA/workflow). AI cannot self-approve. No real prod dispatch unless policy allows.",
    inputSchema: {
      type: "object",
      required: ["projectId", "commitSha", "approvalId"],
      properties: {
        projectId: { type: "string" },
        commitSha: { type: "string" },
        approvalId: { type: "string" },
        ciGreen: { type: "boolean" },
        securityOk: { type: "boolean" },
        dbCompatOk: { type: "boolean" },
      },
    },
  },
  {
    name: "deploy.rollback.plan",
    description:
      "Plan rollback to known-good SHA; includes DB migration risk assessment.",
    inputSchema: {
      type: "object",
      required: ["projectId", "environment"],
      properties: {
        projectId: { type: "string" },
        environment: { type: "string" },
        targetSha: { type: "string" },
      },
    },
  },
  {
    name: "deploy.rollback.request",
    description:
      "Request approved rollback. Requires human approvalId. Production dispatch still gated by policy.",
    inputSchema: {
      type: "object",
      required: ["projectId", "environment", "approvalId"],
      properties: {
        projectId: { type: "string" },
        environment: { type: "string" },
        approvalId: { type: "string" },
        targetSha: { type: "string" },
        previousDeployId: { type: "string" },
        dbCompatOk: { type: "boolean" },
      },
    },
  },
  {
    name: "deploy.approval.create",
    description:
      "Human deploy_approver only: bind approval to requestor + project + environment + commitSha + workflow. Cannot self-approve. Still pending until operator approves at /operators; then tell agent to proceed with approvalId.",
    inputSchema: {
      type: "object",
      required: [
        "projectId",
        "environment",
        "commitSha",
        "requestorPrincipalId",
      ],
      properties: {
        projectId: { type: "string" },
        environment: { type: "string" },
        commitSha: { type: "string" },
        requestorPrincipalId: { type: "string" },
        workflow: { type: "string" },
        action: { type: "string", enum: ["production", "rollback"] },
        ttlMs: { type: "number" },
      },
    },
  },
  {
    name: "platform.info",
    description:
      "Platform architecture, modules, stack profile statuses. Protocol-compatible ≠ certified.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "platform.projects",
    description:
      "List universal project registry entries visible to the principal (no secrets).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "platform.metrics",
    description: "Admin: in-process tool execution metrics snapshot.",
    inputSchema: { type: "object", properties: {} },
  },
];
