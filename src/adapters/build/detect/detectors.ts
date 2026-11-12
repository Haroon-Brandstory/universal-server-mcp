import type { CuratedTask, StackDetection, StackDetector } from "../types.js";
import { TASKS } from "../tasks.js";
import { hasAny, hasFile } from "./scan.js";

function pkgScripts(pkg: Record<string, unknown> | null): string[] {
  const s = pkg?.scripts;
  if (!s || typeof s !== "object") return [];
  return Object.keys(s as Record<string, unknown>);
}

function nodeTasks(
  ctx: Parameters<StackDetector["detect"]>[0],
  pkg: Record<string, unknown> | null
): CuratedTask[] {
  const scripts = pkgScripts(pkg);
  const hasLock =
    hasFile(ctx, "package-lock.json") ||
    hasFile(ctx, "pnpm-lock.yaml") ||
    hasFile(ctx, "yarn.lock");
  const deps = {
    ...(typeof pkg?.dependencies === "object" && pkg?.dependencies
      ? (pkg.dependencies as Record<string, string>)
      : {}),
    ...(typeof pkg?.devDependencies === "object" && pkg?.devDependencies
      ? (pkg.devDependencies as Record<string, string>)
      : {}),
  };
  const hasTs =
    hasFile(ctx, "tsconfig.json") || Object.prototype.hasOwnProperty.call(deps, "typescript");

  const out: CuratedTask[] = [hasLock ? TASKS.nodeInstall : TASKS.nodeInstallNoLock];
  if (scripts.includes("build")) out.push(TASKS.nodeBuild);
  if (scripts.includes("test") || scripts.includes("test:unit")) out.push(TASKS.nodeTest);
  if (hasFile(ctx, "test.js")) out.push(TASKS.nodeFileTest);
  if (scripts.includes("lint")) out.push(TASKS.nodeLint);
  if (hasTs || scripts.includes("typecheck")) out.push(TASKS.nodeTypecheck);
  return out;
}

const nodeFamily: StackDetector = {
  id: "node-family",
  detect(ctx) {
    if (!hasFile(ctx, "package.json")) return null;
    const pkg = ctx.readJson<Record<string, unknown>>("package.json");
    if (!pkg) return null;
    const deps = {
      ...(typeof pkg.dependencies === "object" && pkg.dependencies
        ? (pkg.dependencies as Record<string, string>)
        : {}),
      ...(typeof pkg.devDependencies === "object" && pkg.devDependencies
        ? (pkg.devDependencies as Record<string, string>)
        : {}),
    };
    const evidence: StackDetection["evidence"] = [
      { file: "package.json", detail: "Node manifest present" },
    ];
    let framework = "nodejs";
    let confidence = 0.7;

    if (
      deps.next ||
      hasFile(ctx, "next.config.js") ||
      hasFile(ctx, "next.config.mjs") ||
      hasFile(ctx, "next.config.ts")
    ) {
      framework = "nextjs";
      confidence = 0.95;
      evidence.push({ file: "next", detail: "Next.js dependency or config" });
    } else if (deps.nuxt || hasFile(ctx, "nuxt.config.ts") || hasFile(ctx, "nuxt.config.js")) {
      framework = "nuxt";
      confidence = 0.93;
      evidence.push({ file: "nuxt", detail: "Nuxt dependency or config" });
    } else if (deps["@angular/core"] || hasFile(ctx, "angular.json")) {
      framework = "angular";
      confidence = 0.93;
      evidence.push({ file: "angular", detail: "Angular markers" });
    } else if (deps.svelte || deps["@sveltejs/kit"] || hasFile(ctx, "svelte.config.js")) {
      framework = "svelte";
      confidence = 0.9;
      evidence.push({ file: "svelte", detail: "Svelte markers" });
    } else if (deps.vue) {
      framework = "vue";
      confidence = 0.85;
      evidence.push({ file: "vue", detail: "Vue dependency" });
    } else if (deps.react || deps["react-dom"]) {
      framework = "react";
      confidence = 0.85;
      evidence.push({ file: "react", detail: "React dependency" });
    } else if (deps["@nestjs/core"]) {
      framework = "nestjs";
      confidence = 0.92;
      evidence.push({ file: "nestjs", detail: "NestJS dependency" });
    } else if (deps["@strapi/strapi"] || deps.strapi) {
      framework = "strapi";
      confidence = 0.92;
      evidence.push({ file: "strapi", detail: "Strapi dependency" });
    } else if (deps.express) {
      framework = "express";
      confidence = 0.8;
      evidence.push({ file: "express", detail: "Express dependency" });
    }

    const pm = hasFile(ctx, "pnpm-lock.yaml")
      ? "pnpm"
      : hasFile(ctx, "yarn.lock")
        ? "yarn"
        : "npm";

    return {
      language: "javascript",
      framework,
      packageManager: pm,
      runtimeHint: "node20",
      confidence,
      evidence,
      suggestedTasks: nodeTasks(ctx, pkg),
      detectorId: "node-family",
    };
  },
};

const pythonFamily: StackDetector = {
  id: "python-family",
  detect(ctx) {
    const hasPy =
      hasFile(ctx, "pyproject.toml") ||
      hasFile(ctx, "requirements.txt") ||
      hasFile(ctx, "Pipfile") ||
      hasFile(ctx, "manage.py") ||
      hasFile(ctx, "main.py");
    if (!hasPy) return null;

    const evidence: StackDetection["evidence"] = [];
    let framework = "python";
    let confidence = 0.7;
    const pyproject = ctx.readText("pyproject.toml") || "";
    const req = ctx.readText("requirements.txt") || "";
    const blob = `${pyproject}\n${req}`.toLowerCase();

    if (hasFile(ctx, "manage.py") || blob.includes("django")) {
      framework = "django";
      confidence = 0.92;
      evidence.push({ file: "django", detail: "Django markers" });
    } else if (blob.includes("fastapi")) {
      framework = "fastapi";
      confidence = 0.9;
      evidence.push({ file: "fastapi", detail: "FastAPI dependency" });
    } else if (hasFile(ctx, "pyproject.toml")) {
      evidence.push({ file: "pyproject.toml", detail: "Python project metadata" });
      confidence = 0.8;
    } else if (hasFile(ctx, "requirements.txt")) {
      evidence.push({ file: "requirements.txt", detail: "pip requirements" });
    } else if (hasFile(ctx, "main.py")) {
      evidence.push({ file: "main.py", detail: "Python entrypoint" });
    }

    const tasks: CuratedTask[] = [];
    if (hasFile(ctx, "requirements.txt")) tasks.push(TASKS.pythonInstall);
    if (hasFile(ctx, "test_basic.py")) tasks.push(TASKS.pythonFileTest);
    else tasks.push(TASKS.pythonPytest);

    return {
      language: "python",
      framework,
      packageManager: "pip",
      runtimeHint: "python3.12",
      confidence,
      evidence,
      suggestedTasks: tasks,
      detectorId: "python-family",
    };
  },
};

const phpFamily: StackDetector = {
  id: "php-family",
  detect(ctx) {
    const wp =
      hasFile(ctx, "wp-config.php") ||
      hasFile(ctx, "wp-settings.php") ||
      hasAny(ctx, ["wp-content/", "wp-includes/"]);
    const composer = hasFile(ctx, "composer.json");
    const composerJson = composer ? ctx.readJson<Record<string, unknown>>("composer.json") : null;
    const require =
      composerJson && typeof composerJson.require === "object" && composerJson.require
        ? (composerJson.require as Record<string, string>)
        : {};
    const laravel = hasFile(ctx, "artisan") || Boolean(require["laravel/framework"]);

    if (!wp && !composer && !hasFile(ctx, "index.php")) return null;

    const evidence: StackDetection["evidence"] = [];
    let framework = "php";
    let confidence = 0.7;
    if (wp) {
      framework = "wordpress";
      confidence = 0.95;
      evidence.push({ file: "wordpress", detail: "WordPress markers" });
    } else if (laravel) {
      framework = "laravel";
      confidence = 0.93;
      evidence.push({ file: "laravel", detail: "Laravel markers" });
    } else if (composer) {
      evidence.push({ file: "composer.json", detail: "Composer project" });
      confidence = 0.85;
    } else {
      evidence.push({ file: "index.php", detail: "PHP entrypoint" });
    }

    const tasks: CuratedTask[] = [];
    if (composer) tasks.push(TASKS.phpComposerInstall);
    if (hasFile(ctx, "index.php")) tasks.push(TASKS.phpLint);
    if (
      hasFile(ctx, "vendor/bin/phpunit") ||
      hasFile(ctx, "phpunit.xml") ||
      hasFile(ctx, "phpunit.xml.dist")
    ) {
      tasks.push(TASKS.phpUnit);
    }

    return {
      language: "php",
      framework,
      packageManager: composer ? "composer" : "none",
      runtimeHint: "php8.3",
      confidence,
      evidence,
      suggestedTasks: tasks,
      detectorId: "php-family",
    };
  },
};

const javaFamily: StackDetector = {
  id: "java-family",
  detect(ctx) {
    const maven = hasFile(ctx, "pom.xml");
    const gradle =
      hasFile(ctx, "build.gradle") ||
      hasFile(ctx, "build.gradle.kts") ||
      hasFile(ctx, "settings.gradle");
    if (!maven && !gradle) return null;
    const pom = ctx.readText("pom.xml") || "";
    const gradleText =
      (ctx.readText("build.gradle") || "") + (ctx.readText("build.gradle.kts") || "");
    let framework = "java";
    let confidence = 0.8;
    const evidence: StackDetection["evidence"] = [];
    if (pom.includes("spring-boot") || gradleText.includes("spring-boot")) {
      framework = "spring-boot";
      confidence = 0.92;
      evidence.push({ file: "spring", detail: "Spring Boot markers" });
    }
    if (maven) evidence.push({ file: "pom.xml", detail: "Maven project" });
    if (gradle) evidence.push({ file: "gradle", detail: "Gradle project" });

    return {
      language: "java",
      framework,
      packageManager: maven ? "maven" : "gradle",
      runtimeHint: "jdk17",
      confidence,
      evidence,
      suggestedTasks: [maven ? TASKS.mavenTest : TASKS.gradleTest],
      detectorId: "java-family",
    };
  },
};

const dotnetFamily: StackDetector = {
  id: "dotnet-family",
  detect(ctx) {
    const sln = [...ctx.files].some((f) => f.endsWith(".sln"));
    const csproj = [...ctx.files].some((f) => f.endsWith(".csproj"));
    if (!sln && !csproj) return null;
    return {
      language: "csharp",
      framework: "dotnet",
      packageManager: "dotnet",
      runtimeHint: "dotnet8",
      confidence: 0.9,
      evidence: [
        {
          file: sln ? "*.sln" : "*.csproj",
          detail: ".NET project manifest",
        },
      ],
      suggestedTasks: [TASKS.dotnetTest],
      detectorId: "dotnet-family",
    };
  },
};

const goFamily: StackDetector = {
  id: "go-family",
  detect(ctx) {
    if (!hasFile(ctx, "go.mod")) return null;
    return {
      language: "go",
      framework: "go",
      packageManager: "go",
      runtimeHint: "go1.22",
      confidence: 0.95,
      evidence: [{ file: "go.mod", detail: "Go module" }],
      suggestedTasks: [TASKS.goTest, TASKS.goBuild],
      detectorId: "go-family",
    };
  },
};

const staticFamily: StackDetector = {
  id: "static-family",
  detect(ctx) {
    if (hasFile(ctx, "package.json") || hasFile(ctx, "composer.json") || hasFile(ctx, "go.mod")) {
      return null;
    }
    const html = hasFile(ctx, "index.html");
    const hasCss = [...ctx.files].some((f) => f.endsWith(".css"));
    const hasJs = [...ctx.files].some((f) => f.endsWith(".js"));
    if (!html && !(hasCss && hasJs)) return null;
    return {
      language: "html",
      framework: "static",
      packageManager: "none",
      confidence: html ? 0.75 : 0.55,
      evidence: [
        {
          file: html ? "index.html" : "assets",
          detail: "Static web assets",
        },
      ],
      suggestedTasks: [TASKS.staticCheck],
      detectorId: "static-family",
    };
  },
};

/** Built-in detectors. Extend via registerDetector() — no gateway edits. */
export const BUILTIN_DETECTORS: StackDetector[] = [
  nodeFamily,
  pythonFamily,
  phpFamily,
  javaFamily,
  dotnetFamily,
  goFamily,
  staticFamily,
];
