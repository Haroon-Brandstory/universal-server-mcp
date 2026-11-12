import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PolicyDocument } from "../types.js";

export interface StackProfile {
  id: string;
  ecosystem: string;
  frameworks?: string[];
  /** Declared support status — do not claim certified unless tested. */
  status: "certified" | "supported" | "experimental" | "planned";
  notes?: string;
  build_task_hints?: string[];
  deploy_profile_hints?: string[];
}

export interface StackProfilesDocument {
  version: number;
  profiles: StackProfile[];
}

export function loadStackProfiles(policy?: PolicyDocument): StackProfilesDocument {
  const path = resolve(
    process.cwd(),
    policy?.platform?.stack_profiles_path ||
      process.env.MCP_STACK_PROFILES_PATH ||
      "./config/stack-profiles.yaml"
  );
  if (!existsSync(path)) {
    return { version: 1, profiles: [] };
  }
  const doc = parseYaml(readFileSync(path, "utf8")) as StackProfilesDocument;
  return doc?.profiles ? doc : { version: 1, profiles: [] };
}
