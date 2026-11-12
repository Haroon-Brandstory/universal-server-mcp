import type { DeployProfileId } from "./types.js";

export interface DeployProfile {
  id: DeployProfileId;
  label: string;
  /** Pipeline checklist items (framework-agnostic steps). */
  pipelineHints: string[];
  /** Rollback considerations. */
  rollbackHints: string[];
  defaultActionId: string;
}

/** Profiles are data — gateway never hardcodes Next/Strapi assumptions. */
export const DEPLOY_PROFILES: Record<DeployProfileId, DeployProfile> = {
  nextjs: {
    id: "nextjs",
    label: "Next.js",
    pipelineHints: [
      "build",
      "typecheck",
      "smoke /api/health",
      "invalidate CDN if configured",
    ],
    rollbackHints: ["redeploy previous artifact", "no DB migrate-down assumed"],
    defaultActionId: "app.deploy",
  },
  strapi: {
    id: "strapi",
    label: "Strapi",
    pipelineHints: [
      "build admin",
      "run approved migrations if staged",
      "health /_health",
      "reload process manager",
    ],
    rollbackHints: [
      "check migration forward-only compatibility",
      "restore known-good app artifact",
    ],
    defaultActionId: "strapi.deploy",
  },
  wordpress: {
    id: "wordpress",
    label: "WordPress",
    pipelineHints: ["rsync theme/plugin artifact", "wp cache flush", "http health"],
    rollbackHints: ["restore previous theme/plugin revision"],
    defaultActionId: "wp.deploy",
  },
  django: {
    id: "django",
    label: "Django",
    pipelineHints: ["collectstatic", "migrate (approved)", "gunicorn reload", "health"],
    rollbackHints: ["assess migration reversibility before rollback"],
    defaultActionId: "django.deploy",
  },
  laravel: {
    id: "laravel",
    label: "Laravel",
    pipelineHints: ["composer install --no-dev", "migrate (approved)", "php-fpm reload"],
    rollbackHints: ["DB migrate compatibility required"],
    defaultActionId: "laravel.deploy",
  },
  springboot: {
    id: "springboot",
    label: "Spring Boot",
    pipelineHints: ["jar/image deploy", "actuator health", "rolling restart"],
    rollbackHints: ["redeploy previous image tag"],
    defaultActionId: "spring.deploy",
  },
  docker: {
    id: "docker",
    label: "Docker application",
    pipelineHints: ["pull pinned digest", "compose up", "container health"],
    rollbackHints: ["redeploy previous digest"],
    defaultActionId: "docker.deploy",
  },
  static: {
    id: "static",
    label: "Static website",
    pipelineHints: ["upload artifact", "invalidate CDN", "HEAD /"],
    rollbackHints: ["restore previous artifact bundle"],
    defaultActionId: "static.deploy",
  },
};

export function getDeployProfile(id: string): DeployProfile {
  const p = DEPLOY_PROFILES[id as DeployProfileId];
  if (!p) throw new Error(`Unknown deploy profile: ${id}`);
  return p;
}
