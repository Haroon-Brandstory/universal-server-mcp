#!/usr/bin/env node
import { startStdioGateway } from "./gateway.js";
import { startHttpGateway } from "./transport/httpServer.js";

async function main(): Promise<void> {
  const mode = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();
  if (mode === "http" || mode === "sse" || mode === "streamable-http") {
    await startHttpGateway();
    return;
  }
  await startStdioGateway();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
