import { randomUUID } from "node:crypto";
import type {
  DeployDispatchInput,
  DeployDispatchResult,
  DeployProvider,
} from "../types.js";

/**
 * GitHub Actions provider — dispatches workflow_dispatch via Octokit when
 * not mocked. Never embeds secrets in tool args; uses env GitHub App/PAT.
 */
export class GitHubActionsProvider implements DeployProvider {
  kind = "github_actions" as const;

  constructor(
    private readonly opts: {
      forceMock: boolean;
      /** Injected for tests. */
      dispatchFn?: (input: DeployDispatchInput) => Promise<DeployDispatchResult>;
    }
  ) {}

  async dispatch(input: DeployDispatchInput): Promise<DeployDispatchResult> {
    if (this.opts.forceMock || this.opts.dispatchFn) {
      if (this.opts.dispatchFn) return this.opts.dispatchFn(input);
      if (input.commitSha.toLowerCase().startsWith("deadbeef")) {
        return {
          provider: "github_actions",
          externalId: `gha-mock-${randomUUID()}`,
          status: "failed",
          detail: "simulated release failure",
          mocked: true,
        };
      }
      return {
        provider: "github_actions",
        externalId: `gha-mock-${randomUUID()}`,
        status: input.dryRun ? "planned" : "queued",
        detail: `mock workflow_dispatch ${input.workflow} sha=${input.commitSha.slice(0, 7)}`,
        mocked: true,
      };
    }

    // Live path: dynamic import Octokit client already used by GitOps
    const { getGitHubClient } = await import("../../git/githubClient.js");
    if (!input.repo || !input.repo.includes("/")) {
      throw new Error("repo owner/name required for github_actions provider");
    }
    const [owner, repo] = input.repo.split("/");
    if (!/^[A-Za-z0-9._-]+$/.test(input.workflow)) {
      throw new Error("Invalid workflow id");
    }
    const octokit = getGitHubClient();
    try {
      await octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: input.workflow,
        ref: input.commitSha,
        inputs: {
          environment: input.environment,
          commit_sha: input.commitSha,
          profile: input.profile,
        },
      });
      return {
        provider: "github_actions",
        externalId: `gha-${owner}-${repo}-${input.workflow}-${Date.now()}`,
        status: "queued",
        detail: "workflow_dispatch accepted",
        mocked: false,
      };
    } catch (err) {
      throw new Error(
        `GitHub Actions dispatch failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async status(externalId: string) {
    return {
      status: "running" as const,
      detail: `GitHub Actions status poll limited; id=${externalId}`,
    };
  }
}
