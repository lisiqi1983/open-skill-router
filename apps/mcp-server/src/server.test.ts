import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createSkillRouterMcpServer } from "./server.js";

describe("createSkillRouterMcpServer", () => {
  it("registers M3 tools and can call recommend_skills over MCP", async () => {
    const server = createSkillRouterMcpServer();
    const client = new Client({
      name: "open-skill-router-test-client",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "inspect_skill",
        "install_skill",
        "load_skill",
        "recommend_skills",
        "record_feedback",
        "update_skill",
      ]);

      const result = await client.callTool({
        name: "recommend_skills",
        arguments: {
          task: "帮我生成一份产品发布 PPT",
          source_root: "../../examples/mock-skills",
          include_candidate_pack: true,
          model_rerank: {
            schemaVersion: "skillrouter.model-rerank/v1",
            rankings: [
              {
                skill_id: "local:presentation-deck",
                score: 100,
                reasons: ["Best match for PPT deck generation."],
                recommended_action: "install",
              },
            ],
          },
        },
      });

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          modelRerank: expect.objectContaining({
            applied: true,
          }),
          recommendations: expect.arrayContaining([
            expect.objectContaining({
              skill: expect.objectContaining({ name: "presentation-deck" }),
              modelRerankScore: 100,
            }),
          ]),
        }),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
