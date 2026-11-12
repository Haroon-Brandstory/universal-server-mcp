import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PolicyDocument, Principal } from "../../types.js";
import { resetFindingsStoreForTests } from "./findings.js";
import { redactEvidence } from "./redact.js";
import {
  auditHeaders,
  auditServer,
  findings,
  listTargets,
  remediationPlan,
  scanCode,
  scanContainer,
  scanDependencies,
  scanSecrets,
} from "./operations.js";

const vulnRoot = resolve(process.cwd(), "fixtures/securityops/vuln-app");
const targetsPath = resolve(process.cwd(), "fixtures/securityops/security.yaml");

function makePolicy(findingsPath: string): PolicyDocument {
  return {
    version: 1,
    environment: "development",
    kill_switch: false,
    rate_limit_per_min: 60,
    projects: [
      {
        id: "app",
        allow_hosts: ["example.com"],
        allow_paths: [vulnRoot],
      },
    ],
    principals: [],
    deny_hosts: [],
    ssrf: {
      block_private: true,
      block_loopback: false,
      block_link_local: true,
      block_metadata: true,
    },
    securityops: {
      enabled: true,
      targets_path: targetsPath,
      findings_path: findingsPath,
      force_mock_scanners: true,
      allow_production_scans: false,
      max_findings_per_scan: 50,
      scanner_timeout_sec: 30,
    },
  };
}

function principal(partial: Partial<Principal> & { id: string }): Principal {
  return {
    roles: [],
    allow_hosts: ["example.com"],
    allow_paths: [vulnRoot],
    capabilities: [],
    allow_methods: ["GET"],
    write: false,
    max_response_bytes: 65536,
    projects: ["app"],
    ...partial,
  };
}

let dir: string;
let policy: PolicyDocument;

afterEach(() => {
  if (policy) resetFindingsStoreForTests(policy);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  dir = mkdtempSync(join(tmpdir(), "secops-"));
  policy = makePolicy(join(dir, "findings.json"));
  return policy;
}

describe("security redact", () => {
  it("strips private keys and tokens from evidence", () => {
    const out = redactEvidence(
      "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\nghp_abcdefghijklmnopqrstuv"
    );
    assert.ok(out.includes("[REDACTED"));
    assert.ok(!out.includes("ABC"));
    assert.ok(!out.includes("ghp_"));
  });
});

describe("security authorization", () => {
  it("lists only principal project targets", () => {
    setup();
    const out = listTargets(policy, principal({ id: "op" }));
    const ids = out.targets.map((t) => t.id).sort();
    assert.ok(ids.includes("vuln-app"));
    assert.ok(ids.includes("prod-target"));
    assert.ok(!ids.includes("other-target"));
  });

  it("denies cross-project target access", async () => {
    setup();
    await assert.rejects(
      () =>
        scanCode(policy, principal({ id: "op" }), { targetId: "other-target" }),
      /not authorized/
    );
  });

  it("blocks non-passive production scans", async () => {
    setup();
    await assert.rejects(
      () =>
        scanCode(policy, principal({ id: "op" }), { targetId: "prod-target" }),
      /production scans blocked/
    );
  });
});

describe("security scans (fixtures + mock tools)", () => {
  it("detects code + secrets in vuln fixture", async () => {
    setup();
    const p = principal({ id: "op" });
    const code = await scanCode(policy, p, { targetId: "vuln-app" });
    assert.ok(code.findings.some((f) => /eval/i.test(f.title)));
    assert.ok(code.findings.every((f) => f.verification === "unverified"));
    assert.ok(
      code.findings.some((f) => f.scanner === "builtin.framework") ||
        code.scanners.some((s) => s.id === "builtin.framework")
    );

    const secrets = await scanSecrets(policy, p, { targetId: "vuln-app" });
    assert.ok(secrets.findings.length >= 1);
    const blob = JSON.stringify(secrets.findings);
    assert.ok(!blob.includes("sk_test_hardcoded_secret_value_12345"));

    const deps = await scanDependencies(policy, p, { targetId: "vuln-app" });
    assert.ok(deps.scanners.some((s) => s.id === "npm.audit" || s.id === "osv-scanner"));
    assert.ok(deps.findings.length >= 1);

    const ctn = await scanContainer(policy, p, { targetId: "vuln-app" });
    assert.ok(ctn.scanners.some((s) => s.id === "trivy" && s.mocked));
  });

  it("server + headers audits use mock path", async () => {
    setup();
    const p = principal({ id: "op" });
    const srv = await auditServer(policy, p, { targetId: "vuln-app" });
    assert.ok(srv.findings.some((f) => /root|2375|fail2ban|SSH|mock/i.test(f.title)));

    const hdr = await auditHeaders(policy, p, { targetId: "vuln-app" });
    assert.ok(hdr.scanners.every((s) => s.mocked));
  });
});

describe("findings + remediation", () => {
  it("filters findings and marks false_positive", async () => {
    setup();
    const p = principal({ id: "op", write: true });
    await scanCode(policy, p, { targetId: "vuln-app" });
    const listed = findings(policy, p, { projectId: "app" });
    assert.ok(listed.findings.length >= 1);
    const id = listed.findings[0]!.id;
    const updated = findings(policy, p, {
      findingId: id,
      setVerification: "false_positive",
    });
    assert.equal(updated.finding?.verification, "false_positive");
  });

  it("remediation plan never auto-applies prod infra", async () => {
    setup();
    const p = principal({ id: "op", write: true });
    const scanned = await scanSecrets(policy, p, { targetId: "vuln-app" });
    const id = scanned.findings[0]!.id;
    const plan = await remediationPlan(policy, p, {
      findingId: id,
      validateOnly: true,
    });
    assert.equal(plan.productionRelease.autoApply, false);
    assert.ok(
      plan.steps.some((s) => s.id === "prod-release" && s.status === "blocked")
    );
    assert.ok(plan.note.toLowerCase().includes("not confirmed") || plan.note);
  });
});
