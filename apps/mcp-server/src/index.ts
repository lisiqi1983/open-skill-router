#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSkillRouterMcpServer } from "./server.js";

export async function startStdioServer(): Promise<void> {
  const server = createSkillRouterMcpServer();
  await server.connect(new StdioServerTransport());
}

if (isDirectRun()) {
  startStdioServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`open-skill-router-mcp: ${message}`);
    process.exitCode = 1;
  });
}

function isDirectRun(): boolean {
  const invokedPath = process.argv[1]?.replace(/\\/g, "/");
  return Boolean(invokedPath && import.meta.url.endsWith(invokedPath));
}
