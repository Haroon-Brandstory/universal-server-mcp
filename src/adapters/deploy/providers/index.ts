import type { DeployProvider, DeployProviderKind } from "../types.js";
import { GitHubActionsProvider } from "./githubActions.js";
import { MockDeployProvider } from "./mock.js";
import { VpsDeployProvider } from "./vps.js";

let ghaOverride: DeployProvider | null = null;
let forceMock = false;

export function setDeployProviderMocksForTests(opts: {
  forceMock?: boolean;
  gha?: DeployProvider | null;
}): void {
  if (opts.forceMock !== undefined) forceMock = opts.forceMock;
  if (opts.gha !== undefined) ghaOverride = opts.gha;
}

export function getDeployProvider(kind: DeployProviderKind): DeployProvider {
  const mock = forceMock || kind === "mock";
  if (mock && (kind === "mock" || forceMock)) {
    if (kind === "github_actions" && ghaOverride) return ghaOverride;
    if (kind === "github_actions") {
      return new GitHubActionsProvider({ forceMock: true });
    }
    if (kind === "vps") {
      return new VpsDeployProvider({ forceMock: true });
    }
    return new MockDeployProvider();
  }
  switch (kind) {
    case "github_actions":
      return ghaOverride || new GitHubActionsProvider({ forceMock: false });
    case "vps":
      return new VpsDeployProvider({ forceMock: false });
    case "docker":
    case "pm2":
    case "systemd":
    case "vercel":
      // Extensible stubs — route through mock until implemented & tested
      return new MockDeployProvider();
    default:
      throw new Error(`Unsupported deploy provider: ${kind}`);
  }
}
