import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  getProfile,
  nextjsPm2AppName,
  pm2Bin,
  strapiPm2AppName,
} from "./profiles.js";

const keys = [
  "MCP_PM2_BIN",
  "MCP_PM2_NEXTJS_NAME",
  "MCP_PM2_STRAPI_NAME",
] as const;

afterEach(() => {
  for (const k of keys) delete process.env[k];
});

describe("pm2 profile env", () => {
  it("defaults BSD Global PM2 app names", () => {
    assert.equal(nextjsPm2AppName(), "frontend-nextjs");
    assert.equal(strapiPm2AppName(), "strapi-backend");
    assert.equal(pm2Bin(), "pm2");
  });

  it("honors MCP_PM2_* at getProfile time", () => {
    process.env.MCP_PM2_BIN = "/usr/local/sbin/bsd-pm2";
    process.env.MCP_PM2_NEXTJS_NAME = "frontend-nextjs";
    const p = getProfile("nextjs");
    assert.deepEqual(p.restartArgv?.("ignored"), [
      "/usr/local/sbin/bsd-pm2",
      "restart",
      "frontend-nextjs",
    ]);
    assert.deepEqual(p.statusArgv, [
      "/usr/local/sbin/bsd-pm2",
      "describe",
      "frontend-nextjs",
    ]);
  });
});
