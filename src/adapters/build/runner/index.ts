import type { PolicyDocument } from "../../../types.js";
import type { BuildRunner } from "../types.js";
import { DockerBuildRunner } from "./dockerRunner.js";
import { ProcessBuildRunner } from "./processRunner.js";

let testOverride: BuildRunner | null = null;

export function setBuildRunnerForTests(runner: BuildRunner | null): void {
  testOverride = runner;
}

export function createBuildRunner(policy: PolicyDocument): BuildRunner {
  if (testOverride) return testOverride;
  const kind = policy.build?.runner || "docker";
  if (kind === "process") {
    if (!policy.build?.allow_process_runner) {
      throw new Error(
        "Process build runner disabled. Set build.allow_process_runner: true (dev/test only) or use docker."
      );
    }
    if (policy.environment === "production") {
      throw new Error("Process build runner forbidden in production environment");
    }
    return new ProcessBuildRunner();
  }
  return new DockerBuildRunner();
}
