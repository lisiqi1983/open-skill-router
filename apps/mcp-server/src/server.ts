import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  inspectSkillTool,
  installSkillTool,
  loadSkillTool,
  recommendSkillsTool,
  recordFeedbackTool,
  updateSkillTool,
} from "./toolHandlers.js";

const scopeSchema = z.enum(["user", "project"]);
const recommendationModeSchema = z.enum([
  "fast_metadata",
  "full_skill_rerank",
  "strict_local",
]);
const recommendedActionSchema = z.enum([
  "use",
  "install",
  "update_then_use",
  "inspect_first",
  "avoid",
]);
const modelRerankSchema = z.object({
  schemaVersion: z.literal("skillrouter.model-rerank/v1").optional(),
  rankings: z.array(
    z.object({
      skill_id: z.string().min(1),
      score: z.number().min(0).max(100),
      reasons: z.array(z.string()).optional(),
      covers: z.array(z.string()).optional(),
      missing: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      recommended_action: recommendedActionSchema.optional(),
    }),
  ),
  combination: z
    .object({
      needed: z.boolean(),
      skills: z.array(z.string()),
      reason: z.string().optional(),
    })
    .optional(),
});

export function createSkillRouterMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "open-skill-router",
      version: "0.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    },
  );

  server.registerTool(
    "recommend_skills",
    {
      title: "Recommend Skills",
      description:
        "Recommend Agent Skills for a user task from a local index or source root.",
      inputSchema: {
        task: z.string().min(1),
        index_path: z.string().optional(),
        source_root: z.string().optional(),
        privacy_mode: z.enum(["strict", "balanced", "cloud"]).optional(),
        recommendation_mode: recommendationModeSchema.optional(),
        max_results: z.number().int().positive().max(50).optional(),
        include_candidate_pack: z.boolean().optional(),
        model_rerank: modelRerankSchema.optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonToolResult(await recommendSkillsTool(input)),
  );

  server.registerTool(
    "inspect_skill",
    {
      title: "Inspect Skill",
      description:
        "Inspect a local or GitHub skill source and return source, hash, file list, permissions, and risk.",
      inputSchema: {
        locator: z.string().min(1),
        home_dir: z.string().optional(),
        project_root: z.string().optional(),
        scope: scopeSchema.optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (input) => jsonToolResult(await inspectSkillTool(input)),
  );

  server.registerTool(
    "install_skill",
    {
      title: "Install Skill",
      description:
        "Install a selected skill into the local cache and generic Agent Skills target.",
      inputSchema: {
        locator: z.string().min(1),
        agent_host: z.literal("generic").optional(),
        scope: scopeSchema.optional(),
        target_dir: z.string().optional(),
        home_dir: z.string().optional(),
        project_root: z.string().optional(),
        allow_high_risk: z.boolean().optional(),
        pin: z.boolean().optional(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => jsonToolResult(await installSkillTool(input)),
  );

  server.registerTool(
    "load_skill",
    {
      title: "Load Skill",
      description:
        "Load an installed skill from the local lockfile and return its cache path and SKILL.md content.",
      inputSchema: {
        skill: z.string().min(1),
        home_dir: z.string().optional(),
        project_root: z.string().optional(),
        scope: scopeSchema.optional(),
        max_skill_md_chars: z.number().int().positive().max(100_000).optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonToolResult(await loadSkillTool(input)),
  );

  server.registerTool(
    "update_skill",
    {
      title: "Update Skill",
      description: "Check installed skills for updates or apply safe updates.",
      inputSchema: {
        action: z.enum(["check", "safe"]).optional(),
        skill: z.string().optional(),
        home_dir: z.string().optional(),
        project_root: z.string().optional(),
        scope: scopeSchema.optional(),
        target_dir: z.string().optional(),
      },
      annotations: {
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => jsonToolResult(await updateSkillTool(input)),
  );

  server.registerTool(
    "record_feedback",
    {
      title: "Record Feedback",
      description:
        "Record local recommendation feedback without uploading user files or task contents.",
      inputSchema: {
        skill_id: z.string().min(1),
        recommendation_id: z.string().optional(),
        accepted: z.boolean().optional(),
        task_completed: z.boolean().optional(),
        rating: z.number().int().min(1).max(5).optional(),
        comment: z.string().max(2000).optional(),
        anonymous_tags: z.record(z.string(), z.unknown()).optional(),
        home_dir: z.string().optional(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonToolResult(await recordFeedbackTool(input)),
  );

  return server;
}

export function jsonToolResult(data: Record<string, unknown>) {
  return {
    structuredContent: data,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
