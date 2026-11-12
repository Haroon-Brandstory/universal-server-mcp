import { readFileSync, existsSync } from "node:fs";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { sanitizeGitError } from "./validation.js";

export type GitHubClient = Octokit;

let cached: GitHubClient | null = null;
let testOverride: GitHubClient | null = null;

function loadPrivateKey(): string | undefined {
  const inline = process.env.GITHUB_APP_PRIVATE_KEY;
  if (inline) return inline.replace(/\\n/g, "\n");
  const path = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (path && existsSync(path)) {
    return readFileSync(path, "utf8");
  }
  return undefined;
}

/**
 * Prefer GitHub App installation auth.
 * Fallback: GITHUB_TOKEN (PAT) for local/dev only — still never returned to clients.
 */
export function getGitHubClient(): GitHubClient {
  if (testOverride) return testOverride;
  if (cached) return cached;

  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const privateKey = loadPrivateKey();

  try {
    if (appId && installationId && privateKey) {
      cached = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: Number(appId),
          privateKey,
          installationId: Number(installationId),
        },
      });
      return cached;
    }

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      cached = new Octokit({ auth: token });
      return cached;
    }
  } catch (err) {
    throw sanitizeGitError(err);
  }

  throw new Error(
    "GitHub credentials not configured. Set GITHUB_APP_ID + GITHUB_APP_INSTALLATION_ID + GITHUB_APP_PRIVATE_KEY(_PATH), or GITHUB_TOKEN for local-only."
  );
}

export function resetGitHubClientForTests(client?: GitHubClient | null): void {
  testOverride = client ?? null;
  cached = null;
}

export function mapOctokitError(err: unknown): Error {
  const anyErr = err as {
    status?: number;
    message?: string;
    response?: { data?: { message?: string; documentation_url?: string } };
  };
  if (anyErr?.status === 401 || anyErr?.status === 403) {
    const msg = anyErr.response?.data?.message || anyErr.message || "";
    if (/rate limit/i.test(msg) || anyErr.status === 403 && /rate/i.test(msg)) {
      return new Error("GitHub API rate limit exceeded");
    }
    if (anyErr.status === 401) {
      return new Error("GitHub authentication failed or credentials expired");
    }
    return new Error(
      `GitHub permission denied: ${anyErr.response?.data?.message || "forbidden"}`
    );
  }
  if (anyErr?.status === 404) {
    return new Error("GitHub resource not found or not visible to this app");
  }
  if (anyErr?.status === 409 || anyErr?.status === 422) {
    return new Error(
      anyErr.response?.data?.message ||
        anyErr.message ||
        "GitHub rejected the operation (conflict or validation)"
    );
  }
  return sanitizeGitError(err);
}
