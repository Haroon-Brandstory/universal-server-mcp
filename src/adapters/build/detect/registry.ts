import type { StackDetection, StackDetector } from "../types.js";
import { buildDetectContext } from "./scan.js";
import { BUILTIN_DETECTORS } from "./detectors.js";

const extra: StackDetector[] = [];

/** Register a custom detector without modifying gateway core. */
export function registerDetector(detector: StackDetector): void {
  if (!detector?.id || typeof detector.detect !== "function") {
    throw new Error("Invalid stack detector");
  }
  const idx = extra.findIndex((d) => d.id === detector.id);
  if (idx >= 0) extra[idx] = detector;
  else extra.push(detector);
}

export function listDetectors(): StackDetector[] {
  return [...BUILTIN_DETECTORS, ...extra];
}

export function resetDetectorsForTests(): void {
  extra.length = 0;
}

export function detectStack(root: string): {
  primary: StackDetection | null;
  candidates: StackDetection[];
} {
  const ctx = buildDetectContext(root);
  const candidates: StackDetection[] = [];
  for (const d of listDetectors()) {
    const hit = d.detect(ctx);
    if (hit) candidates.push(hit);
  }
  candidates.sort((a, b) => b.confidence - a.confidence);
  return { primary: candidates[0] || null, candidates };
}
