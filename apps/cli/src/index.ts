#!/usr/bin/env node
import { Command } from "commander";
import {
  defaultProjectIndexPath,
  discoverLocalSkills,
  readLocalSkillIndex,
  recommendSkills,
  writeLocalSkillIndex,
  type RecommendationMode,
} from "@openskillrouter/core";

const program = new Command();

program
  .name("skillrouter")
  .description("Local-first router for Agent Skills.")
  .version("0.0.0");

program
  .command("index")
  .description("Index a local Agent Skills-compatible directory.")
  .argument(
    "<source>",
    "Local directory containing one or more SKILL.md files.",
  )
  .option("-o, --out <path>", "Output index path.", defaultProjectIndexPath())
  .option("--json", "Print machine-readable JSON.")
  .action(async (source: string, options: { out: string; json?: boolean }) => {
    const index = await discoverLocalSkills(source);
    await writeLocalSkillIndex(index, options.out);

    if (options.json) {
      console.log(
        JSON.stringify(
          { outputPath: options.out, skillCount: index.skills.length, index },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`Indexed ${index.skills.length} skill(s).`);
    console.log(`Source: ${index.sourceRoot}`);
    console.log(`Index: ${options.out}`);
  });

program
  .command("recommend")
  .description("Recommend skills for a task from the local index.")
  .argument("<task>", "Natural language task.")
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option("-m, --max <count>", "Maximum recommendations.", parseInteger, 5)
  .option(
    "--mode <mode>",
    "Recommendation mode: fast_metadata, full_skill_rerank, strict_local.",
    parseRecommendationMode,
    "fast_metadata",
  )
  .option("--json", "Print machine-readable JSON.")
  .option(
    "--candidate-pack",
    "Include a candidate pack for model-assisted rerank.",
  )
  .action(
    async (
      task: string,
      options: {
        index: string;
        max: number;
        mode: RecommendationMode;
        json?: boolean;
        candidatePack?: boolean;
      },
    ) => {
      const index = await readLocalSkillIndex(options.index);
      const mode = options.candidatePack
        ? options.mode === "fast_metadata"
          ? "full_skill_rerank"
          : options.mode
        : options.mode;
      const result = recommendSkills({
        index,
        task,
        maxResults: options.max,
        mode,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printRecommendations(task, result.recommendations);
      if (result.candidatePack) {
        console.log("");
        console.log(
          `Candidate pack: ${result.candidatePack.candidates.length} candidate(s), mode ${result.candidatePack.mode}.`,
        );
      }
    },
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`skillrouter: ${message}`);
  process.exitCode = 1;
});

function printRecommendations(
  task: string,
  recommendations: ReturnType<typeof recommendSkills>["recommendations"],
): void {
  console.log(`Task: ${task}`);
  console.log("");

  if (recommendations.length === 0) {
    console.log("No matching skills found. Try indexing more sources.");
    return;
  }

  console.log(`Found ${recommendations.length} candidate skill(s):`);
  console.log("");

  for (const recommendation of recommendations) {
    console.log(
      `[${recommendation.rank}] ${recommendation.skill.displayName ?? recommendation.skill.name}`,
    );
    console.log(
      `    Score: ${recommendation.score} / 100 (${recommendation.confidence})`,
    );
    console.log(`    Source: ${recommendation.skill.locator}`);
    console.log(`    Status: ${recommendation.installStatus}`);
    console.log(`    Risk: ${recommendation.skill.riskLevel}`);
    console.log(`    Action: ${recommendation.recommendedAction}`);
    console.log("");
    console.log("    Reasons:");
    for (const reason of recommendation.reasons) {
      console.log(`    - ${reason}`);
    }
    if (recommendation.missing.length > 0) {
      console.log("");
      console.log("    Missing:");
      for (const missing of recommendation.missing) {
        console.log(`    - ${missing}`);
      }
    }
    console.log("");
  }
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }
  return parsed;
}

function parseRecommendationMode(value: string): RecommendationMode {
  if (
    value === "fast_metadata" ||
    value === "full_skill_rerank" ||
    value === "strict_local"
  ) {
    return value;
  }

  throw new Error(
    `Expected fast_metadata, full_skill_rerank, or strict_local; received "${value}".`,
  );
}
