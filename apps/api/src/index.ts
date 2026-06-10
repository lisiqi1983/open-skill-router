#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import type { RecommendationScoringConfig } from "@openskillrouter/core";
import { createSkillRouterApiServer } from "./server.js";

export { createSkillRouterApiServer } from "./server.js";
export type {
  FeedbackApiRequest,
  RecommendApiRequest,
  SkillRouterApiOptions,
} from "./server.js";

const program = new Command();

program
  .name("open-skill-router-api")
  .description("Optional self-hosted HTTP API for Open Skill Router.")
  .version("0.0.0");

program
  .command("serve")
  .description("Start the Open Skill Router HTTP API.")
  .option("--host <host>", "Host to bind.", "127.0.0.1")
  .option("--port <port>", "Port to bind.", parsePort, 8765)
  .option("--source <name-or-url>", "Default static source name, path, or URL.")
  .option("--index <path>", "Fallback local index path.")
  .option("--source-registry <path>", "Source registry path.")
  .option("--feedback-dir <path>", "Feedback JSONL directory.")
  .option("--scoring <path>", "Default scoring config JSON path.")
  .option(
    "--allow-direct-sources",
    "Allow request bodies to pass direct source URLs.",
  )
  .action(
    async (options: {
      host: string;
      port: number;
      source?: string;
      index?: string;
      sourceRegistry?: string;
      feedbackDir?: string;
      scoring?: string;
      allowDirectSources?: boolean;
    }) => {
      const defaultScoring = options.scoring
        ? await readJsonFile<RecommendationScoringConfig>(options.scoring)
        : undefined;
      const server = createSkillRouterApiServer({
        defaultSource: options.source,
        indexPath: options.index,
        sourceRegistry: options.sourceRegistry,
        feedbackDir: options.feedbackDir,
        defaultScoring,
        allowDirectSources: options.allowDirectSources,
      });

      await new Promise<void>((resolve) => {
        server.listen(options.port, options.host, resolve);
      });

      console.log(
        `Open Skill Router API listening on http://${options.host}:${options.port}`,
      );
    },
  );

if (isDirectRun()) {
  program.parseAsync(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`open-skill-router-api: ${message}`);
    process.exitCode = 1;
  });
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive port, received "${value}".`);
  }
  return parsed;
}

function isDirectRun(): boolean {
  const invokedPath = process.argv[1]?.replace(/\\/g, "/");
  return Boolean(invokedPath && import.meta.url.endsWith(invokedPath));
}
