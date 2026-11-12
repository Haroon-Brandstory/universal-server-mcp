import type { CuratedTask } from "./types.js";

/** Curated argv templates — never AI-supplied shell. */
export const TASKS = {
  nodeInstall: {
    id: "node.install",
    kind: "install",
    label: "npm ci (frozen lockfile preferred)",
    image: "node:20-bookworm-slim",
    argv: ["npm", "ci", "--ignore-scripts"],
    networkRequired: true,
    isInstall: true,
  },
  nodeInstallNoLock: {
    id: "node.install.nolock",
    kind: "install",
    label: "npm install --ignore-scripts (no lockfile)",
    image: "node:20-bookworm-slim",
    argv: ["npm", "install", "--ignore-scripts"],
    networkRequired: true,
    isInstall: true,
  },
  nodeBuild: {
    id: "node.build",
    kind: "build",
    label: "npm run build",
    image: "node:20-bookworm-slim",
    argv: ["npm", "run", "build", "--if-present"],
  },
  nodeTest: {
    id: "node.test",
    kind: "test",
    label: "npm test",
    image: "node:20-bookworm-slim",
    argv: ["npm", "test", "--if-present"],
  },
  nodeFileTest: {
    id: "node.file.test",
    kind: "test",
    label: "node test.js (no package install)",
    image: "node:20-bookworm-slim",
    argv: ["node", "test.js"],
  },
  nodeLint: {
    id: "node.lint",
    kind: "lint",
    label: "npm run lint",
    image: "node:20-bookworm-slim",
    argv: ["npm", "run", "lint", "--if-present"],
  },
  nodeTypecheck: {
    id: "node.typecheck",
    kind: "typecheck",
    label: "tsc --noEmit",
    image: "node:20-bookworm-slim",
    argv: ["npx", "--yes", "typescript@5.8.3", "tsc", "--noEmit"],
    networkRequired: true,
  },
  pythonPytest: {
    id: "python.pytest",
    kind: "test",
    label: "pytest",
    image: "python:3.12-slim",
    argv: ["python", "-m", "pytest", "-q"],
  },
  pythonFileTest: {
    id: "python.file.test",
    kind: "test",
    label: "python test_basic.py (stdlib only)",
    image: "python:3.12-slim",
    argv: ["python", "test_basic.py"],
  },
  pythonInstall: {
    id: "python.install",
    kind: "install",
    label: "pip install -r requirements.txt (no deps escalation)",
    image: "python:3.12-slim",
    argv: [
      "pip",
      "install",
      "--no-cache-dir",
      "--disable-pip-version-check",
      "-r",
      "requirements.txt",
    ],
    networkRequired: true,
    isInstall: true,
  },
  phpComposerInstall: {
    id: "php.composer.install",
    kind: "install",
    label: "composer install --no-scripts",
    image: "composer:2",
    argv: ["composer", "install", "--no-interaction", "--no-scripts", "--prefer-dist"],
    networkRequired: true,
    isInstall: true,
  },
  phpLint: {
    id: "php.lint",
    kind: "lint",
    label: "php -l index.php (syntax)",
    image: "php:8.3-cli",
    argv: ["php", "-l", "index.php"],
  },
  phpUnit: {
    id: "php.phpunit",
    kind: "test",
    label: "phpunit (if present)",
    image: "php:8.3-cli",
    argv: ["php", "vendor/bin/phpunit", "--do-not-cache-result"],
  },
  goTest: {
    id: "go.test",
    kind: "test",
    label: "go test ./...",
    image: "golang:1.22-bookworm",
    argv: ["go", "test", "./..."],
  },
  goBuild: {
    id: "go.build",
    kind: "build",
    label: "go build ./...",
    image: "golang:1.22-bookworm",
    argv: ["go", "build", "./..."],
  },
  mavenTest: {
    id: "maven.test",
    kind: "test",
    label: "mvn -B test",
    image: "maven:3.9-eclipse-temurin-17",
    argv: ["mvn", "-B", "-DskipITs", "test"],
    networkRequired: true,
  },
  gradleTest: {
    id: "gradle.test",
    kind: "test",
    label: "gradle test",
    image: "gradle:8-jdk17",
    argv: ["gradle", "test", "--no-daemon"],
    networkRequired: true,
  },
  dotnetTest: {
    id: "dotnet.test",
    kind: "test",
    label: "dotnet test",
    image: "mcr.microsoft.com/dotnet/sdk:8.0",
    argv: ["dotnet", "test", "--nologo"],
    networkRequired: true,
  },
  staticCheck: {
    id: "static.check",
    kind: "lint",
    label: "Verify index.html exists",
    image: "busybox:1.36",
    argv: ["ls", "-la", "index.html"],
  },
} as const satisfies Record<string, CuratedTask>;

export function taskById(id: string): CuratedTask | undefined {
  return Object.values(TASKS).find((t) => t.id === id);
}

export function tasksForKinds(
  tasks: CuratedTask[],
  kinds: Array<CuratedTask["kind"]>
): CuratedTask[] {
  const set = new Set(kinds);
  return tasks.filter((t) => set.has(t.kind));
}
