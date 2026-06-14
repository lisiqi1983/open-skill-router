#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
  defaultProjectSearchIndexPath,
  defaultSourceRegistryPath,
  addSourceRegistryEntry,
  analyzeSkillCatalog,
  buildSkillSearchIndex,
  buildSkillSearchIndexWithStats,
  buildSkillCatalog,
  checkSkillSearchIndexFreshness,
  checkStaticSourceHealth,
  discoverLocalSkills,
  localIndexFromSkillSearchIndex,
  readSkillSearchIndex,
  readStaticSkillIndex,
  readLocalSkillIndex,
  readSourceRegistry,
  recommendSkills,
  removeSourceRegistryEntry,
  resolveSourceRegistryEntry,
  resolveSourceUrls,
  searchSkillIndex,
  searchSkills,
  writeSkillSearchIndex,
  writeLocalSkillIndex,
  renderSkillCatalogAnalysisMarkdown,
  type SkillCatalog,
  type SkillCatalogAnalysis,
  type SkillSearchHit,
  type SearchSkillsOptions,
  type ModelRerankOutput,
  type RecommendationMode,
  type RecommendationScoringConfig,
} from "@openskillrouter/core";

type CliRiskLevel = NonNullable<SearchSkillsOptions["riskLevels"]>[number];
type CliSourceType = NonNullable<SearchSkillsOptions["sourceTypes"]>[number];
import { buildStaticIndexFromManifest } from "@openskillrouter/indexer";

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
  .option(
    "--skip-invalid",
    "Research mode: skip malformed SKILL.md files and record them in invalidSkills.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      source: string,
      options: { out: string; skipInvalid?: boolean; json?: boolean },
    ) => {
      const index = await discoverLocalSkills(source, {
        skipInvalid: options.skipInvalid,
      });
      await writeLocalSkillIndex(index, options.out);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              outputPath: options.out,
              skillCount: index.skills.length,
              invalidSkillCount: index.invalidSkills?.length ?? 0,
              index,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`Indexed ${index.skills.length} skill(s).`);
      if ((index.invalidSkills?.length ?? 0) > 0) {
        console.log(
          `Skipped ${index.invalidSkills?.length ?? 0} invalid skill(s).`,
        );
      }
      console.log(`Source: ${index.sourceRoot}`);
      console.log(`Index: ${options.out}`);
    },
  );

program
  .command("recommend")
  .description(
    "Recommend skills for a task from a local index or static source.",
  )
  .argument("<task>", "Natural language task.")
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option(
    "--source <name-or-url>",
    "Static source name, directory, JSONL file, or URL.",
  )
  .option(
    "--source-registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("--api <url>", "Optional Open Skill Router API base URL.")
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
  .option(
    "--model-rerank <path>",
    "Apply a model rerank JSON file produced from a candidate pack.",
  )
  .option(
    "--scoring <path>",
    "Apply a recommendation scoring config JSON file.",
  )
  .option(
    "--search-prefilter",
    "Use search top-k as the recommendation candidate pool.",
  )
  .option(
    "--search-max <count>",
    "Maximum candidates retained by search prefilter.",
    parseInteger,
  )
  .option(
    "--search-index <path>",
    "Use a prebuilt persistent Skill search index for search prefiltering.",
  )
  .action(
    async (
      task: string,
      options: {
        index: string;
        source?: string;
        sourceRegistry: string;
        api?: string;
        max: number;
        mode: RecommendationMode;
        json?: boolean;
        candidatePack?: boolean;
        modelRerank?: string;
        scoring?: string;
        searchPrefilter?: boolean;
        searchMax?: number;
        searchIndex?: string;
      },
    ) => {
      if (options.api && options.searchIndex) {
        throw new Error(
          "--search-index is local-only; configure the API server with a search index instead.",
        );
      }
      const modelRerank = options.modelRerank
        ? await readJsonFile<ModelRerankOutput>(options.modelRerank)
        : undefined;
      const scoring = options.scoring
        ? await readJsonFile<RecommendationScoringConfig>(options.scoring)
        : undefined;
      const prebuiltSearchIndex = options.searchIndex
        ? await readSkillSearchIndex(options.searchIndex)
        : undefined;
      const useSearchPrefilter =
        options.searchPrefilter || Boolean(prebuiltSearchIndex);
      const mode = options.candidatePack
        ? options.mode === "fast_metadata"
          ? "full_skill_rerank"
          : options.mode
        : options.mode;
      const result = options.api
        ? await recommendWithApi(options.api, {
            task,
            source: options.source,
            max_results: options.max,
            recommendation_mode: mode,
            include_candidate_pack: options.candidatePack,
            model_rerank: modelRerank,
            scoring,
            search_prefilter: useSearchPrefilter,
            search_max_results: options.searchMax,
          })
        : recommendSkills({
            index: prebuiltSearchIndex
              ? localIndexFromSkillSearchIndex(prebuiltSearchIndex)
              : await readRecommendationIndex({
                  indexPath: options.index,
                  source: options.source,
                  sourceRegistry: options.sourceRegistry,
                }),
            task,
            maxResults: options.max,
            mode,
            modelRerank,
            scoring,
            searchPrefilter: useSearchPrefilter
              ? {
                  maxResults: options.searchMax,
                  searchIndex: prebuiltSearchIndex,
                }
              : undefined,
          });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printRecommendations(task, result.recommendations);
      if (result.searchPrefilter) {
        console.log("");
        console.log(
          `Search prefilter: ${result.searchPrefilter.results.length}/${result.searchPrefilter.filteredSkillCount} candidate(s), from ${result.searchPrefilter.totalSkillCount} skill(s).`,
        );
      }
      if (result.candidatePack) {
        console.log("");
        console.log(
          `Candidate pack: ${result.candidatePack.candidates.length} candidate(s), mode ${result.candidatePack.mode}.`,
        );
      }
      if (result.modelRerank) {
        console.log("");
        console.log(
          `Model rerank: ${result.modelRerank.applied ? "applied" : "not applied"}.`,
        );
        if (result.modelRerank.validation.issues.length > 0) {
          console.log("Model rerank issues:");
          for (const issue of result.modelRerank.validation.issues) {
            console.log(`- ${issue.path}: ${issue.message}`);
          }
        }
      }
    },
  );

program
  .command("search")
  .description(
    "Search large local or remote Skill indexes before model reranking.",
  )
  .argument("<query>", "Natural language query.")
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option(
    "--source <name-or-url>",
    "Static source name, directory, JSONL file, or URL.",
  )
  .option(
    "--source-registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option(
    "--search-index <path>",
    "Use a prebuilt persistent Skill search index instead of reading a source.",
  )
  .option("-m, --max <count>", "Maximum search hits.", parseInteger, 20)
  .option(
    "--source-type <types>",
    "Comma-separated source types: github, local, mcp_registry, agent_skills_registry, custom.",
    parseSourceTypes,
  )
  .option(
    "--risk <levels>",
    "Comma-separated risk levels: low, medium, high, unknown.",
    parseRiskLevels,
  )
  .option("--domain <domains>", "Comma-separated catalog domains.", parseList)
  .option("--intent <intents>", "Comma-separated catalog intents.", parseList)
  .option(
    "--environment <environments>",
    "Comma-separated catalog environments.",
    parseList,
  )
  .option("--local-only", "Only search local Skill sources.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      query: string,
      options: {
        index: string;
        source?: string;
        sourceRegistry: string;
        searchIndex?: string;
        max: number;
        sourceType?: CliSourceType[];
        risk?: CliRiskLevel[];
        domain?: string[];
        intent?: string[];
        environment?: string[];
        localOnly?: boolean;
        json?: boolean;
      },
    ) => {
      const result = options.searchIndex
        ? searchSkillIndex({
            searchIndex: await readSkillSearchIndex(options.searchIndex),
            query,
            maxResults: options.max,
            sourceTypes: options.sourceType,
            riskLevels: options.risk,
            domains: options.domain,
            intents: options.intent,
            environments: options.environment,
            localOnly: options.localOnly,
          })
        : searchSkills({
            index: await readRecommendationIndex({
              indexPath: options.index,
              source: options.source,
              sourceRegistry: options.sourceRegistry,
            }),
            query,
            maxResults: options.max,
            sourceTypes: options.sourceType,
            riskLevels: options.risk,
            domains: options.domain,
            intents: options.intent,
            environments: options.environment,
            localOnly: options.localOnly,
          });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printSearchResults(result);
    },
  );

const searchIndexCommand = program
  .command("search-index")
  .description("Build persistent search indexes for large Skill collections.");

searchIndexCommand
  .command("build")
  .description(
    "Build a persistent Skill search index from a local index or static source.",
  )
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option(
    "--source <name-or-url>",
    "Static source name, directory, JSONL file, or URL.",
  )
  .option(
    "--source-registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option(
    "-o, --out <path>",
    "Output persistent search index path.",
    defaultProjectSearchIndexPath(),
  )
  .option(
    "--incremental",
    "Reuse unchanged skill documents from the existing output search index.",
  )
  .option("--if-stale", "Skip rebuild when the existing search index is fresh.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      index: string;
      source?: string;
      sourceRegistry: string;
      out: string;
      incremental?: boolean;
      ifStale?: boolean;
      json?: boolean;
    }) => {
      const sourceIndex = await readRecommendationIndex({
        indexPath: options.index,
        source: options.source,
        sourceRegistry: options.sourceRegistry,
      });
      const previousIndex =
        options.incremental || options.ifStale
          ? await readExistingSearchIndex(options.out)
          : undefined;
      const freshness = previousIndex
        ? checkSkillSearchIndexFreshness(sourceIndex, previousIndex)
        : undefined;

      if (options.ifStale && freshness?.status === "fresh") {
        const freshSearchIndex = previousIndex;
        if (!freshSearchIndex) {
          throw new Error(
            "Fresh search index status requires an existing index.",
          );
        }
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                outputPath: options.out,
                skipped: true,
                freshness,
                searchIndex: freshSearchIndex,
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log("Search index is fresh; skipped rebuild.");
        printSearchIndexSummary(freshSearchIndex, options.out);
        return;
      }

      const build = buildSkillSearchIndexWithStats(sourceIndex, {
        previousIndex:
          options.incremental || options.ifStale ? previousIndex : undefined,
      });
      await writeSkillSearchIndex(build.searchIndex, options.out);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              outputPath: options.out,
              skipped: false,
              freshnessBeforeBuild: freshness,
              reusedDocumentCount: build.reusedDocumentCount,
              rebuiltDocumentCount: build.rebuiltDocumentCount,
              searchIndex: build.searchIndex,
            },
            null,
            2,
          ),
        );
        return;
      }

      printSearchIndexBuildSummary(build, options.out, freshness);
    },
  );

searchIndexCommand
  .command("status")
  .description(
    "Check whether a persistent search index matches its source index.",
  )
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option(
    "--source <name-or-url>",
    "Static source name, directory, JSONL file, or URL.",
  )
  .option(
    "--source-registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option(
    "--search-index <path>",
    "Persistent search index path.",
    defaultProjectSearchIndexPath(),
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      index: string;
      source?: string;
      sourceRegistry: string;
      searchIndex: string;
      json?: boolean;
    }) => {
      const sourceIndex = await readRecommendationIndex({
        indexPath: options.index,
        source: options.source,
        sourceRegistry: options.sourceRegistry,
      });
      const searchIndex = await readSkillSearchIndex(options.searchIndex);
      const freshness = checkSkillSearchIndexFreshness(
        sourceIndex,
        searchIndex,
      );

      if (options.json) {
        console.log(JSON.stringify(freshness, null, 2));
        return;
      }

      printSearchIndexFreshness(freshness, options.searchIndex);
    },
  );

const catalogCommand = program
  .command("catalog")
  .description("Build and inspect a multidimensional Skill Catalog.");

catalogCommand
  .command("build")
  .description("Build a Skill Catalog from a local index or static source.")
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option(
    "--source <name-or-url>",
    "Static source name, directory, JSONL file, or URL.",
  )
  .option(
    "--source-registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("-o, --out <path>", "Write catalog JSON to this path.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      index: string;
      source?: string;
      sourceRegistry: string;
      out?: string;
      json?: boolean;
    }) => {
      const catalog = buildSkillCatalog(
        await readRecommendationIndex({
          indexPath: options.index,
          source: options.source,
          sourceRegistry: options.sourceRegistry,
        }),
      );

      if (options.out) {
        await writeJsonFile(options.out, catalog);
      }

      if (options.json) {
        console.log(JSON.stringify(catalog, null, 2));
        return;
      }

      printCatalogSummary(catalog, options.out);
    },
  );

catalogCommand
  .command("analyze")
  .description(
    "Analyze catalog coverage, sparse dimensions, and tensor-style matrix slices.",
  )
  .option("--catalog <path>", "Existing Skill Catalog JSON path.")
  .option("-i, --index <path>", "Local index path.", defaultProjectIndexPath())
  .option(
    "--source <name-or-url>",
    "Static source name, directory, JSONL file, or URL.",
  )
  .option(
    "--source-registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("-o, --out <path>", "Write catalog analysis JSON to this path.")
  .option("--markdown <path>", "Write a Markdown analysis report.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (options: {
      catalog?: string;
      index: string;
      source?: string;
      sourceRegistry: string;
      out?: string;
      markdown?: string;
      json?: boolean;
    }) => {
      const catalog = options.catalog
        ? await readJsonFile<SkillCatalog>(options.catalog)
        : buildSkillCatalog(
            await readRecommendationIndex({
              indexPath: options.index,
              source: options.source,
              sourceRegistry: options.sourceRegistry,
            }),
          );
      const analysis = analyzeSkillCatalog(catalog);

      if (options.out) {
        await writeJsonFile(options.out, analysis);
      }
      if (options.markdown) {
        await writeTextFile(
          options.markdown,
          renderSkillCatalogAnalysisMarkdown(analysis),
        );
      }

      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
        return;
      }

      printCatalogAnalysisSummary(analysis, {
        jsonPath: options.out,
        markdownPath: options.markdown,
      });
    },
  );

program
  .command("index-source")
  .description("Build a static JSONL index from skillrouter.source.yaml.")
  .argument("<manifest>", "Path to skillrouter.source.yaml.")
  .requiredOption("-o, --out <dir>", "Output directory for static files.")
  .option(
    "--skip-invalid",
    "Research mode: skip malformed local SKILL.md files in manifest sources.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      manifest: string,
      options: {
        out: string;
        skipInvalid?: boolean;
        json?: boolean;
      },
    ) => {
      const result = await buildStaticIndexFromManifest(manifest, {
        outDir: options.out,
        skipInvalid: options.skipInvalid,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Built static index: ${result.manifest.name}`);
      console.log(`Skills: ${result.manifest.skillCount}`);
      console.log(`Manifest: ${result.manifestPath}`);
      console.log(`JSONL: ${result.skillsPath}`);
      console.log(`Checksum: ${result.checksumPath}`);
    },
  );

const sourceCommand = program
  .command("source")
  .description("Manage static skill metadata sources.");

sourceCommand
  .command("add")
  .description("Add or replace a named static source.")
  .argument(
    "<url>",
    "Static index URL, directory, index.json, or skills.jsonl.",
  )
  .argument("[name]", "Source name.", "public")
  .option("--mirror <url...>", "Mirror static source URL(s).")
  .option(
    "--registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      url: string,
      name: string,
      options: { registry: string; mirror?: string[]; json?: boolean },
    ) => {
      const registry = await addSourceRegistryEntry(
        { name, url, mirrors: options.mirror },
        options.registry,
      );

      if (options.json) {
        console.log(JSON.stringify(registry, null, 2));
        return;
      }

      console.log(`Added source "${name}": ${url}`);
      if (options.mirror && options.mirror.length > 0) {
        console.log(`Mirrors: ${options.mirror.join(", ")}`);
      }
      console.log(`Registry: ${options.registry}`);
    },
  );

sourceCommand
  .command("list")
  .description("List configured static sources.")
  .option(
    "--registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: { registry: string; json?: boolean }) => {
    const registry = await readSourceRegistry(options.registry);

    if (options.json) {
      console.log(JSON.stringify(registry, null, 2));
      return;
    }

    console.log(`Registry: ${options.registry}`);
    if (registry.sources.length === 0) {
      console.log("No static sources configured.");
      return;
    }
    for (const source of registry.sources) {
      console.log(`${source.name} ${source.enabled ? "enabled" : "disabled"}`);
      console.log(`  URL: ${source.url}`);
      if (source.mirrors && source.mirrors.length > 0) {
        console.log(`  Mirrors: ${source.mirrors.join(", ")}`);
      }
      console.log(`  Added: ${source.addedAt}`);
    }
  });

sourceCommand
  .command("health")
  .description("Check a static source and its mirrors.")
  .argument("<name-or-url>", "Source name or direct static source URL/path.")
  .option(
    "--registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      nameOrUrl: string,
      options: { registry: string; json?: boolean },
    ) => {
      const sources = await resolveSourceUrls(nameOrUrl, options.registry);
      const report = await checkStaticSourceHealth(nameOrUrl, sources);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(`Source: ${nameOrUrl}`);
      console.log(`Selected: ${report.selectedSource ?? "none"}`);
      for (const check of report.checks) {
        console.log(
          `${check.ok ? "ok" : "failed"} ${check.role}: ${check.source}`,
        );
        if (check.ok) {
          console.log(`  Skills: ${check.skillCount}`);
          console.log(`  SHA256: ${check.skillsSha256}`);
          console.log(
            `  Matches primary: ${check.checksumMatchesPrimary ? "yes" : "no"}`,
          );
          if (check.cachePath) console.log(`  Cache: ${check.cachePath}`);
        } else {
          console.log(`  Error: ${check.error}`);
        }
      }
    },
  );

sourceCommand
  .command("remove")
  .description("Remove a named static source.")
  .argument("<name>", "Source name.")
  .option(
    "--registry <path>",
    "Source registry path.",
    defaultSourceRegistryPath(),
  )
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (name: string, options: { registry: string; json?: boolean }) => {
      const registry = await removeSourceRegistryEntry(name, options.registry);

      if (options.json) {
        console.log(JSON.stringify(registry, null, 2));
        return;
      }

      console.log(`Removed source "${name}".`);
      console.log(`Registry: ${options.registry}`);
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

program
  .command("serve-mcp")
  .description("Start the Open Skill Router MCP server over stdio.")
  .action(async () => {
    const { startStdioServer } = await import("@openskillrouter/mcp-server");
    await startStdioServer();
  });

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

function printSearchResults(result: ReturnType<typeof searchSkills>): void {
  console.log(`Query: ${result.query}`);
  console.log(
    `Searched ${result.filteredSkillCount}/${result.totalSkillCount} skill(s).`,
  );
  console.log("");

  if (result.results.length === 0) {
    console.log("No matching skills found. Try broadening filters.");
    return;
  }

  console.log(`Found ${result.results.length} search hit(s):`);
  console.log("");
  for (const hit of result.results) {
    printSearchHit(hit);
  }
}

function printSearchIndexSummary(
  searchIndex: ReturnType<typeof buildSkillSearchIndex>,
  outputPath: string,
): void {
  console.log(`Search index: ${searchIndex.skillCount} skill(s).`);
  console.log(`Source root: ${searchIndex.sourceRoot}`);
  console.log(
    `Average document length: ${Math.round(searchIndex.averageDocumentLength)}`,
  );
  console.log(
    `Document frequency terms: ${Object.keys(searchIndex.documentFrequencies).length}`,
  );
  console.log(`Output: ${outputPath}`);
}

function printSearchIndexBuildSummary(
  build: ReturnType<typeof buildSkillSearchIndexWithStats>,
  outputPath: string,
  freshnessBeforeBuild?: ReturnType<typeof checkSkillSearchIndexFreshness>,
): void {
  printSearchIndexSummary(build.searchIndex, outputPath);
  console.log(`Reused documents: ${build.reusedDocumentCount}`);
  console.log(`Rebuilt documents: ${build.rebuiltDocumentCount}`);
  if (freshnessBeforeBuild) {
    console.log(`Previous status: ${freshnessBeforeBuild.status}`);
  }
}

function printSearchIndexFreshness(
  freshness: ReturnType<typeof checkSkillSearchIndexFreshness>,
  searchIndexPath: string,
): void {
  console.log(`Search index: ${searchIndexPath}`);
  console.log(`Status: ${freshness.status}`);
  console.log(`Source root: ${freshness.sourceRoot}`);
  console.log(
    `Skills: source=${freshness.sourceSkillCount}, search-index=${freshness.searchIndexSkillCount}`,
  );
  if (freshness.missingSkillIds.length > 0) {
    console.log(`Missing skills: ${freshness.missingSkillIds.join(", ")}`);
  }
  if (freshness.staleSkillIds.length > 0) {
    console.log(`Stale skills: ${freshness.staleSkillIds.join(", ")}`);
  }
  if (freshness.extraSkillIds.length > 0) {
    console.log(`Extra skills: ${freshness.extraSkillIds.join(", ")}`);
  }
  console.log("Reasons:");
  for (const reason of freshness.reasons) {
    console.log(`- ${reason}`);
  }
}

function printSearchHit(hit: SkillSearchHit): void {
  console.log(`[${hit.rank}] ${hit.skill.displayName ?? hit.skill.name}`);
  console.log(`    Score: ${hit.score} / 100`);
  console.log(`    Source: ${hit.skill.locator}`);
  console.log(`    Type: ${hit.skill.sourceType}`);
  console.log(`    Risk: ${hit.skill.riskLevel}`);
  if (hit.matchedKeywords.length > 0) {
    console.log(`    Keywords: ${hit.matchedKeywords.slice(0, 10).join(", ")}`);
  }
  if (hit.matchedDimensions.length > 0) {
    console.log(
      `    Dimensions: ${hit.matchedDimensions.slice(0, 10).join(", ")}`,
    );
  }
  console.log(
    `    Breakdown: lexical=${hit.scoreBreakdown.lexical}, semantic=${hit.scoreBreakdown.semantic}, catalog=${hit.scoreBreakdown.catalog}, safety=${hit.scoreBreakdown.safety}`,
  );
  console.log("");
  console.log("    Reasons:");
  for (const reason of hit.reasons) {
    console.log(`    - ${reason}`);
  }
  console.log("");
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

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRiskLevels(value: string): CliRiskLevel[] {
  const levels = parseList(value);
  for (const level of levels) {
    if (
      level !== "low" &&
      level !== "medium" &&
      level !== "high" &&
      level !== "unknown"
    ) {
      throw new Error(`Unknown risk level "${level}".`);
    }
  }
  return levels as CliRiskLevel[];
}

function parseSourceTypes(value: string): CliSourceType[] {
  const sourceTypes = parseList(value);
  for (const sourceType of sourceTypes) {
    if (
      sourceType !== "github" &&
      sourceType !== "local" &&
      sourceType !== "mcp_registry" &&
      sourceType !== "agent_skills_registry" &&
      sourceType !== "custom"
    ) {
      throw new Error(`Unknown source type "${sourceType}".`);
    }
  }
  return sourceTypes as CliSourceType[];
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function readExistingSearchIndex(filePath: string) {
  if (!(await fileExists(filePath))) return undefined;
  return readSkillSearchIndex(filePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function readRecommendationIndex(options: {
  indexPath: string;
  source?: string;
  sourceRegistry: string;
}) {
  if (!options.source) {
    return readLocalSkillIndex(options.indexPath);
  }

  const registeredSource = await resolveSourceRegistryEntry(
    options.source,
    options.sourceRegistry,
  );
  return readStaticSkillIndex(
    registeredSource
      ? [registeredSource.url, ...(registeredSource.mirrors ?? [])]
      : options.source,
  );
}

async function recommendWithApi(
  apiUrl: string,
  body: {
    task: string;
    source?: string;
    max_results: number;
    recommendation_mode: RecommendationMode;
    include_candidate_pack?: boolean;
    model_rerank?: ModelRerankOutput;
    scoring?: RecommendationScoringConfig;
    search_prefilter?: boolean;
    search_max_results?: number;
  },
): Promise<ReturnType<typeof recommendSkills>> {
  if (body.recommendation_mode === "strict_local") {
    throw new Error("strict_local recommendations must not use --api.");
  }
  const endpoint = new URL("/v1/recommend", ensureTrailingSlash(apiUrl));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as ReturnType<
    typeof recommendSkills
  > & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? `API request failed: ${response.status}`,
    );
  }
  return result;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function printCatalogSummary(catalog: SkillCatalog, outputPath?: string): void {
  console.log(`Catalog: ${catalog.skillCount} skill(s).`);
  console.log(`Source root: ${catalog.sourceRoot}`);
  if (outputPath) console.log(`Output: ${outputPath}`);
  printTopCounts("Source types", catalog.summary.sourceTypes);
  printTopCounts("Domains", catalog.summary.domains);
  printTopCounts("Intents", catalog.summary.intents);
  printTopCounts("Inputs", catalog.summary.inputFormats);
  printTopCounts("Outputs", catalog.summary.outputFormats);
  printTopCounts("Environments", catalog.summary.environments);
  printTopCounts("Workflow stages", catalog.summary.workflowStages);
  printTopCounts("Risk levels", catalog.summary.riskLevels);
}

function printCatalogAnalysisSummary(
  analysis: SkillCatalogAnalysis,
  outputs: { jsonPath?: string; markdownPath?: string },
): void {
  console.log(`Catalog analysis: ${analysis.skillCount} skill(s).`);
  console.log(`Source root: ${analysis.sourceRoot}`);
  if (outputs.jsonPath) console.log(`JSON output: ${outputs.jsonPath}`);
  if (outputs.markdownPath)
    console.log(`Markdown output: ${outputs.markdownPath}`);
  console.log("");
  console.log("Dimension coverage:");
  for (const dimension of analysis.dimensions) {
    console.log(
      `- ${dimension.dimension}: ${dimension.coveragePercent}% (${dimension.coveredSkillCount}/${dimension.totalSkillCount}), top ${dimension.topValues
        .slice(0, 4)
        .map((item) => `${item.value}=${item.count}`)
        .join(", ")}`,
    );
  }
  console.log("");
  console.log("Matrix slices:");
  for (const slice of analysis.matrixSlices) {
    const topCell = slice.cells[0];
    console.log(
      `- ${slice.name}: ${slice.cells.length} populated cell(s)${
        topCell
          ? `, top ${topCell.rowValue} x ${topCell.columnValue}=${topCell.count}`
          : ""
      }`,
    );
  }
  if (analysis.gaps.length > 0) {
    console.log("");
    console.log("Gaps:");
    for (const gap of analysis.gaps.slice(0, 8)) {
      console.log(`- ${gap.severity}: ${gap.message}`);
    }
  }
}

function printTopCounts(
  label: string,
  counts: Array<{ value: string; count: number }>,
): void {
  const rendered = counts
    .slice(0, 8)
    .map((item) => `${item.value}=${item.count}`)
    .join(", ");
  console.log(`${label}: ${rendered || "none"}`);
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
