import { Client } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(
  repoRoot,
  "apps",
  "mcp-server",
  "dist",
  "index.js",
);
const client = new Client({
  name: "open-skill-router-smoke-client",
  version: "0.0.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: repoRoot,
  stderr: "pipe",
});

await client.connect(transport);

try {
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  for (const expected of [
    "recommend_skills",
    "inspect_skill",
    "install_skill",
    "load_skill",
    "update_skill",
    "record_feedback",
  ]) {
    if (!toolNames.includes(expected)) {
      throw new Error(
        `Missing MCP tool ${expected}; found ${toolNames.join(", ")}`,
      );
    }
  }

  const result = await client.callTool({
    name: "recommend_skills",
    arguments: {
      task: "帮我生成一份产品发布 PPT",
      source_root: "examples/mock-skills",
      include_candidate_pack: true,
      max_results: 3,
    },
  });

  const text =
    result.content?.[0]?.type === "text" ? result.content[0].text : "";
  if (!text.includes("presentation-deck")) {
    throw new Error(
      `MCP recommend_skills did not return presentation-deck:\n${text}`,
    );
  }
} finally {
  await client.close();
}

console.log("Smoke M3 MCP passed.");
