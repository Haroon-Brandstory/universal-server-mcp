import { randomUUID } from "node:crypto";
import type {
  DeployDispatchInput,
  DeployDispatchResult,
  DeployProvider,
} from "../types.js";

/** Allowlisted VPS deploy actions — never arbitrary shell. */
const VPS_ACTIONS: Record<string, string[]> = {
  "app.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "app"],
  "strapi.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "strapi"],
  "wp.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "wordpress"],
  "django.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "django"],
  "laravel.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "laravel"],
  "spring.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "spring"],
  "docker.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "docker"],
  "static.deploy": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "static"],
  "app.rollback": ["sudo", "-n", "/usr/local/bin/mcp-deploy", "rollback"],
};

export class VpsDeployProvider implements DeployProvider {
  kind = "vps" as const;

  constructor(
    private readonly opts: {
      forceMock: boolean;
      exec?: (
        serverId: string,
        argv: string[]
      ) => Promise<{ code: number; stdout: string; stderr: string }>;
    }
  ) {}

  async dispatch(input: DeployDispatchInput): Promise<DeployDispatchResult> {
    const action = input.actionId || "app.deploy";
    const argv = VPS_ACTIONS[action];
    if (!argv) {
      throw new Error(
        `Unsupported VPS action_id: ${action}. Allowed: ${Object.keys(VPS_ACTIONS).join(", ")}`
      );
    }
    if (!input.serverId) {
      throw new Error("server_id required for vps provider");
    }
    if (this.opts.forceMock || !this.opts.exec) {
      return {
        provider: "vps",
        externalId: `vps-mock-${randomUUID()}`,
        status: input.dryRun ? "planned" : "running",
        detail: `mock vps ${input.serverId} argv=${argv.join(" ")} sha=${input.commitSha.slice(0, 7)}`,
        mocked: true,
      };
    }
    if (input.dryRun) {
      return {
        provider: "vps",
        externalId: `vps-dry-${randomUUID()}`,
        status: "planned",
        detail: `dry-run ${argv.join(" ")}`,
        mocked: false,
      };
    }
    const r = await this.opts.exec(input.serverId, [
      ...argv,
      "--sha",
      input.commitSha,
      "--env",
      input.environment,
    ]);
    return {
      provider: "vps",
      externalId: `vps-${randomUUID()}`,
      status: r.code === 0 ? "running" : "failed",
      detail: (r.stdout || r.stderr || "").slice(0, 2000),
      mocked: false,
    };
  }

  async status(externalId: string) {
    return {
      status: "running" as const,
      detail: `vps deploy ${externalId}`,
    };
  }
}

export function listVpsActions(): string[] {
  return Object.keys(VPS_ACTIONS);
}
