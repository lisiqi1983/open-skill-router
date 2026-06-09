#!/usr/bin/env node
import { Command } from "commander";
import {
  applySafeUpdates,
  checkForUpdates,
  getGlobalLockfilePath,
  getLockfilePath,
  initSkillRouter,
  inspectSkill,
  installSkill,
  pinInstalledSkill,
  readLockfile,
  type InstallPlan,
} from "@openskillrouter/cache";
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
  .command("init")
  .description(
    "Initialize SkillRouter home and install the universal entry skill.",
  )
  .option("--agent <agent>", "Target agent host.", parseAgentHost, "generic")
  .option(
    "--scope <scope>",
    "Install scope: user or project.",
    parseScope,
    "user",
  )
  .option("--target-dir <path>", "Explicit target Agent Skills directory.")
  .option("--home <path>", "SkillRouter home directory.")
  .option("--project-root <path>", "Project root for project-scoped installs.")
  .option(
    "--entry-skill-source <path>",
    "Path to the bundled open-skill-router entry skill.",
    "skills/open-skill-router",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      agent: "generic";
      scope: "user" | "project";
      targetDir?: string;
      home?: string;
      projectRoot?: string;
      entrySkillSource: string;
      json?: boolean;
    }) => {
      const result = await initSkillRouter({
        agentHost: options.agent,
        scope: options.scope,
        targetDir: options.targetDir,
        homeDir: options.home,
        projectRoot: options.projectRoot,
        entrySkillSource: options.entrySkillSource,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log("SkillRouter initialized.");
      console.log(`Home: ${result.homeDir}`);
      printInstallPlan(result.entrySkill.plan);
      console.log(
        `Installed entry skill: ${result.entrySkill.installedSkill.installPath}`,
      );
    },
  );

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

program
  .command("inspect")
  .description("Inspect a skill source without installing it.")
  .argument(
    "<locator>",
    "Skill locator, such as github:owner/repo/path@ref or local:/path/to/skill.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(async (locator: string, options: { json?: boolean }) => {
    const plan = await inspectSkill(locator);

    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    printInstallPlan(plan);
  });

program
  .command("install")
  .description("Install a skill into local cache and an agent host.")
  .argument(
    "<locator>",
    "Skill locator, such as github:owner/repo/path@ref or local:/path/to/skill.",
  )
  .option("--agent <agent>", "Target agent host.", parseAgentHost, "generic")
  .option(
    "--scope <scope>",
    "Install scope: user or project.",
    parseScope,
    "user",
  )
  .option("--target-dir <path>", "Explicit target Agent Skills directory.")
  .option("--home <path>", "SkillRouter home directory.")
  .option("--project-root <path>", "Project root for project-scoped installs.")
  .option("--allow-high-risk", "Allow installation of high-risk skills.")
  .option("--pin", "Pin the installed skill in the lockfile.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      locator: string,
      options: {
        agent: "generic";
        scope: "user" | "project";
        targetDir?: string;
        home?: string;
        projectRoot?: string;
        allowHighRisk?: boolean;
        pin?: boolean;
        json?: boolean;
      },
    ) => {
      const result = await installSkill(locator, {
        agentHost: options.agent,
        scope: options.scope,
        targetDir: options.targetDir,
        homeDir: options.home,
        projectRoot: options.projectRoot,
        allowHighRisk: options.allowHighRisk,
        pinned: options.pin,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printInstallPlan(result.plan);
      console.log(`Installed: ${result.installedSkill.installPath}`);
      console.log(`Cache: ${result.installedSkill.cachePath}`);
      console.log(`Lockfile: ${result.plan.lockfilePath}`);
    },
  );

program
  .command("list")
  .description("List installed skills from a SkillRouter lockfile.")
  .option(
    "--scope <scope>",
    "Install scope: user or project.",
    parseScope,
    "user",
  )
  .option("--home <path>", "SkillRouter home directory.")
  .option("--project-root <path>", "Project root for project-scoped lockfile.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      scope: "user" | "project";
      home?: string;
      projectRoot?: string;
      json?: boolean;
    }) => {
      const lockfilePath =
        options.scope === "project"
          ? getLockfilePath({
              scope: "project",
              projectRoot: options.projectRoot,
            })
          : getGlobalLockfilePath(options.home);
      const lockfile = await readLockfile(lockfilePath);

      if (options.json) {
        console.log(JSON.stringify({ lockfilePath, ...lockfile }, null, 2));
        return;
      }

      console.log(`Lockfile: ${lockfilePath}`);
      if (lockfile.skills.length === 0) {
        console.log("No installed skills.");
        return;
      }

      for (const skill of lockfile.skills) {
        console.log(`${skill.metadata.displayName ?? skill.metadata.name}`);
        console.log(`  ID: ${skill.skillId}`);
        console.log(`  Locator: ${skill.locator}`);
        console.log(`  Commit: ${skill.installedCommitSha}`);
        console.log(`  Risk: ${skill.riskLevel}`);
        console.log(`  Pinned: ${skill.pinned}`);
        console.log(`  Install path: ${skill.installPath}`);
      }
    },
  );

program
  .command("update")
  .description("Check for updates or apply safe updates.")
  .option("--check", "Check for updates.", false)
  .option("--safe", "Apply safe updates.", false)
  .option(
    "--scope <scope>",
    "Install scope: user or project.",
    parseScope,
    "user",
  )
  .option("--home <path>", "SkillRouter home directory.")
  .option("--project-root <path>", "Project root for project-scoped lockfile.")
  .option(
    "--target-dir <path>",
    "Explicit target Agent Skills directory for safe updates.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      check?: boolean;
      safe?: boolean;
      scope: "user" | "project";
      home?: string;
      projectRoot?: string;
      targetDir?: string;
      json?: boolean;
    }) => {
      if (options.safe) {
        const updated = await applySafeUpdates({
          scope: options.scope,
          homeDir: options.home,
          projectRoot: options.projectRoot,
          targetDir: options.targetDir,
        });
        if (options.json) {
          console.log(JSON.stringify({ updated }, null, 2));
          return;
        }
        console.log(`Applied ${updated.length} safe update(s).`);
        return;
      }

      const checks = await checkForUpdates({
        scope: options.scope,
        homeDir: options.home,
        projectRoot: options.projectRoot,
        targetDir: options.targetDir,
      });
      if (options.json) {
        console.log(JSON.stringify({ checks }, null, 2));
        return;
      }

      if (!options.check) {
        console.log(
          "No update action specified; showing update check results.",
        );
      }
      printUpdateChecks(checks);
    },
  );

program
  .command("pin")
  .description("Pin or unpin an installed skill in the lockfile.")
  .argument("<skill>", "Installed skill ID or locator.")
  .option("--unpin", "Unpin instead of pinning.", false)
  .option(
    "--scope <scope>",
    "Install scope: user or project.",
    parseScope,
    "user",
  )
  .option("--home <path>", "SkillRouter home directory.")
  .option("--project-root <path>", "Project root for project-scoped lockfile.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      skill: string,
      options: {
        unpin?: boolean;
        scope: "user" | "project";
        home?: string;
        projectRoot?: string;
        json?: boolean;
      },
    ) => {
      const lockfilePath = getLockfilePath({
        scope: options.scope,
        homeDir: options.home,
        projectRoot: options.projectRoot,
      });
      const installedSkill = await pinInstalledSkill(
        lockfilePath,
        skill,
        !options.unpin,
      );

      if (options.json) {
        console.log(JSON.stringify({ lockfilePath, installedSkill }, null, 2));
        return;
      }

      console.log(
        `${installedSkill.metadata.name} pinned=${installedSkill.pinned}`,
      );
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

function printInstallPlan(plan: InstallPlan): void {
  console.log(`${plan.skill.displayName ?? plan.skill.name}`);
  console.log(`  Locator: ${plan.source.locator}`);
  console.log(`  Source: ${plan.source.sourceUrl}`);
  console.log(`  Commit: ${plan.source.commitSha}`);
  console.log(`  Risk: ${plan.scan.riskLevel}`);
  console.log(`  Content hash: ${plan.scan.contentHash}`);
  console.log(`  Files: ${plan.scan.files.length}`);
  console.log(`  Scripts: ${plan.scan.scriptFindings.length}`);
  console.log(`  Cache path: ${plan.cachePath}`);
  console.log(`  Lockfile: ${plan.lockfilePath}`);
  if (plan.warnings.length > 0) {
    console.log("  Warnings:");
    for (const warning of plan.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log("  Permission reasons:");
  for (const reason of plan.scan.reasons) {
    console.log(`  - ${reason}`);
  }
}

function printUpdateChecks(
  checks: Awaited<ReturnType<typeof checkForUpdates>>,
): void {
  if (checks.length === 0) {
    console.log("No installed skills found.");
    return;
  }

  for (const check of checks) {
    console.log(
      `${check.installedSkill.metadata.displayName ?? check.installedSkill.metadata.name}`,
    );
    console.log(`  Classification: ${check.classification}`);
    console.log(`  Current commit: ${check.installedSkill.installedCommitSha}`);
    if (check.latestCommitSha)
      console.log(`  Latest commit: ${check.latestCommitSha}`);
    for (const reason of check.reasons) {
      console.log(`  - ${reason}`);
    }
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

function parseAgentHost(value: string): "generic" {
  if (value === "generic") return value;
  throw new Error(
    `Only the generic agent host is implemented in this milestone; received "${value}".`,
  );
}

function parseScope(value: string): "user" | "project" {
  if (value === "user" || value === "project") return value;
  throw new Error(`Expected user or project scope; received "${value}".`);
}
