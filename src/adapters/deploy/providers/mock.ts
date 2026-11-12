import { randomUUID } from "node:crypto";
import type {
  DeployDispatchInput,
  DeployDispatchResult,
  DeployProvider,
  DeployStatus,
} from "../types.js";

const statusStore = new Map<string, DeployStatus>();

export class MockDeployProvider implements DeployProvider {
  kind = "mock" as const;

  async dispatch(input: DeployDispatchInput): Promise<DeployDispatchResult> {
    const externalId = `mock-${randomUUID()}`;
    if (input.dryRun) {
      statusStore.set(externalId, "planned");
      return {
        provider: "mock",
        externalId,
        status: "planned",
        detail: `dry-run ${input.environment}@${input.commitSha.slice(0, 7)}`,
        mocked: true,
      };
    }
    // Simulate failure marker in SHA for tests
    if (input.commitSha.toLowerCase().startsWith("deadbeef")) {
      statusStore.set(externalId, "failed");
      return {
        provider: "mock",
        externalId,
        status: "failed",
        detail: "simulated release failure",
        mocked: true,
      };
    }
    statusStore.set(externalId, "running");
    return {
      provider: "mock",
      externalId,
      status: "running",
      detail: `mock deploy ${input.workflow} action=${input.actionId || "default"}`,
      mocked: true,
    };
  }

  async status(externalId: string) {
    const status = statusStore.get(externalId) || "failed";
    return { status, detail: `mock status=${status}` };
  }
}

export function resetMockDeployProviderForTests(): void {
  statusStore.clear();
}
