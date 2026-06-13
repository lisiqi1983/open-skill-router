import type { SkillReference } from "@openskillrouter/skill-spec";
import { buildCandidatePack } from "./candidatePack.js";
import { applyModelRerank } from "./modelRerank.js";
import {
  resolveRecommendationScoringConfig,
  scoreRecommendationBreakdown,
} from "./scoring.js";
import { searchSkills } from "./searchSkills.js";
import { buildSkillCatalog } from "./skillCatalog.js";
import { profileTask } from "./taskProfile.js";
import { tokenizeText } from "./tokenize.js";
import type {
  IndexedSkill,
  RecommendSkillsOptions,
  RecommendSkillsResult,
  SkillCatalogCard,
  SkillRecommendation,
  TaskProfile,
} from "./types.js";

export function recommendSkills(
  options: RecommendSkillsOptions,
): RecommendSkillsResult {
  const task = profileTask(options.task, { privacyMode: options.privacyMode });
  const scoring = resolveRecommendationScoringConfig(options.scoring);
  const searchPrefilter = options.searchPrefilter
    ? searchSkills({
        index: options.index,
        query: options.task,
        maxResults:
          options.searchPrefilter.maxResults ??
          defaultSearchPrefilterMax(options.maxResults),
        privacyMode: options.privacyMode,
        sourceTypes: options.searchPrefilter.sourceTypes,
        riskLevels: options.searchPrefilter.riskLevels,
        domains: options.searchPrefilter.domains,
        intents: options.searchPrefilter.intents,
        environments: options.searchPrefilter.environments,
        localOnly: options.searchPrefilter.localOnly,
      })
    : undefined;
  const index = searchPrefilter
    ? filterIndexBySearchResults(options.index, searchPrefilter)
    : options.index;
  const catalogBySkillId = new Map(
    buildSkillCatalog(index).cards.map((card) => [card.skillId, card]),
  );
  const scored = index.skills
    .map((indexedSkill) =>
      scoreSkill(
        indexedSkill,
        task,
        catalogBySkillId.get(indexedSkill.skill.id),
        scoring.weights,
      ),
    )
    .filter((recommendation) => recommendation.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, options.maxResults ?? 5)
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1,
    }));

  const mode = options.mode ?? "fast_metadata";
  const modelRerankResult = options.modelRerank
    ? applyModelRerank({
        recommendations: scored,
        output: options.modelRerank,
        maxResults: options.maxResults,
        modelRerankWeights: scoring.modelRerankWeights,
      })
    : undefined;
  const recommendations = modelRerankResult?.recommendations ?? scored;

  return {
    task,
    recommendations,
    candidatePack:
      mode === "full_skill_rerank" || mode === "strict_local"
        ? buildCandidatePack({
            mode,
            task,
            recommendations,
            indexedSkills: index.skills,
          })
        : undefined,
    modelRerank: modelRerankResult?.modelRerank,
    searchPrefilter,
  };
}

function defaultSearchPrefilterMax(maxResults?: number): number {
  return Math.max(50, (maxResults ?? 5) * 10);
}

function filterIndexBySearchResults(
  index: RecommendSkillsOptions["index"],
  searchResult: NonNullable<RecommendSkillsResult["searchPrefilter"]>,
): RecommendSkillsOptions["index"] {
  const candidateIds = new Set(searchResult.results.map((hit) => hit.skill.id));
  return {
    ...index,
    skills: index.skills.filter((indexedSkill) =>
      candidateIds.has(indexedSkill.skill.id),
    ),
  };
}

function scoreSkill(
  indexedSkill: IndexedSkill,
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
  weights = resolveRecommendationScoringConfig().weights,
): SkillRecommendation {
  const searchableText = buildSearchableText(indexedSkill);
  const searchableTokens = new Set(tokenizeText(searchableText));
  const matchedKeywords = task.keywords.filter(
    (keyword) =>
      searchableTokens.has(keyword) || searchableText.includes(keyword),
  );
  const metadataMatch = percentage(
    matchedKeywords.length,
    Math.max(task.keywords.length, 1),
  );
  const capabilityCoverage = scoreCapabilityCoverage(
    indexedSkill.skill,
    task,
    matchedKeywords,
    catalogCard,
  );
  const inputOutputFit = scoreInputOutputFit(
    indexedSkill.skill,
    task,
    catalogCard,
  );
  const catalogIntentFit = scoreCatalogIntentFit(
    indexedSkill.skill,
    task,
    catalogCard,
  );
  const domainFit = scoreDomainFit(task, catalogCard);
  const environmentFit = scoreEnvironmentFit(
    indexedSkill.skill,
    task,
    catalogCard,
  );
  const workflowFit = scoreWorkflowFit(task, catalogCard);
  const qualityFit = scoreQualityFit(indexedSkill.skill);
  const safetyFit = scoreSafetyFit(indexedSkill.skill);
  const hasRelevanceEvidence =
    metadataMatch > 0 ||
    capabilityCoverage > 0 ||
    catalogIntentFit > 0 ||
    domainFit > 0 ||
    (hasInputOutputRequirement(task) && inputOutputFit > 0) ||
    (task.workflowStages.length > 0 && workflowFit > 0);
  const scoreBreakdown = {
    metadataMatch,
    capabilityCoverage,
    inputOutputFit,
    safetyFit,
    catalogIntentFit,
    domainFit,
    environmentFit,
    workflowFit,
    qualityFit,
  };
  const score = hasRelevanceEvidence
    ? scoreRecommendationBreakdown(scoreBreakdown, weights)
    : 0;
  const risks = risksForSkill(indexedSkill.skill);
  const reasons = reasonsForSkill(indexedSkill.skill, matchedKeywords, task, {
    catalogCard,
    catalogIntentFit,
    domainFit,
    inputOutputFit,
    environmentFit,
    workflowFit,
  });
  const covers = coversForSkill(
    indexedSkill.skill,
    matchedKeywords,
    catalogCard,
  );
  const missing = missingForSkill(indexedSkill.skill, task, catalogCard);

  return {
    skill: indexedSkill.skill,
    score,
    confidence: score >= 75 ? "high" : score >= 45 ? "medium" : "low",
    rank: 0,
    reasons,
    covers,
    missing,
    risks,
    installStatus: "not_installed",
    recommendedAction:
      indexedSkill.skill.riskLevel === "high" ? "inspect_first" : "install",
    explanation: reasons[0] ?? "Matched by indexed skill metadata.",
    matchedKeywords,
    scoreBreakdown,
  };
}

function buildSearchableText(indexedSkill: IndexedSkill): string {
  return [
    indexedSkill.skill.name,
    indexedSkill.skill.displayName,
    indexedSkill.skill.description,
    indexedSkill.skill.tags.join(" "),
    indexedSkill.skill.capabilities.join(" "),
    indexedSkill.skill.intents.join(" "),
    indexedSkill.skill.inputFormats.join(" "),
    indexedSkill.skill.outputFormats.join(" "),
    indexedSkill.body,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreCapabilityCoverage(
  skill: SkillReference,
  task: TaskProfile,
  matchedKeywords: string[],
  catalogCard?: SkillCatalogCard,
): number {
  const capabilityText =
    `${skill.tags.join(" ")} ${skill.capabilities.join(" ")} ${skill.intents.join(" ")}`.toLowerCase();
  const directMatches = matchedKeywords.filter((keyword) =>
    capabilityText.includes(keyword),
  ).length;
  const intentMatches = task.intents.filter((intent) =>
    capabilityText.includes(intent),
  ).length;
  const catalogCapabilityMatches = task.intents.filter((intent) =>
    catalogCard?.dimensions.capabilities.includes(intent),
  ).length;

  return Math.min(
    100,
    directMatches * 20 + intentMatches * 30 + catalogCapabilityMatches * 35,
  );
}

function scoreInputOutputFit(
  skill: SkillReference,
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
): number {
  const inputFormats = new Set([
    ...skill.inputFormats,
    ...(catalogCard?.dimensions.inputFormats ?? []),
  ]);
  const outputFormats = new Set([
    ...skill.outputFormats,
    ...(catalogCard?.dimensions.outputFormats ?? []),
  ]);
  const inputMatches = task.fileTypes.filter((fileType) =>
    inputFormats.has(fileType),
  ).length;
  const outputMatches = task.outputRequirements.filter((output) =>
    outputFormats.has(output),
  ).length;

  if (task.fileTypes.length === 0 && task.outputRequirements.length === 0)
    return 50;

  return Math.min(
    100,
    percentage(
      inputMatches + outputMatches,
      task.fileTypes.length + task.outputRequirements.length,
    ),
  );
}

function scoreCatalogIntentFit(
  skill: SkillReference,
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
): number {
  if (task.intents.length === 0) return 0;
  const intentSurface = new Set([
    ...skill.intents,
    ...skill.capabilities,
    ...(catalogCard?.dimensions.intents ?? []),
    ...(catalogCard?.dimensions.capabilities ?? []),
  ]);
  return percentage(
    task.intents.filter((intent) => intentSurface.has(intent)).length,
    task.intents.length,
  );
}

function scoreDomainFit(
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
): number {
  if (!task.domain) return 0;
  return catalogCard?.dimensions.domains.includes(task.domain) ? 100 : 0;
}

function scoreEnvironmentFit(
  skill: SkillReference,
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
): number {
  const environments = new Set(catalogCard?.dimensions.environments ?? []);
  const requiredMatches = task.environments.filter((environment) =>
    environments.has(environment),
  ).length;
  const requirementFit =
    task.environments.length > 0
      ? percentage(requiredMatches, task.environments.length)
      : 80;

  let privacyFit = 80;
  if (task.privacyMode === "strict" || task.allowNetwork === false) {
    privacyFit = skill.permissions.network.access === "none" ? 100 : 20;
  } else if (task.privacyMode === "cloud" || task.allowNetwork === true) {
    privacyFit = 100;
  }

  return Math.round(0.65 * requirementFit + 0.35 * privacyFit);
}

function scoreWorkflowFit(
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
): number {
  if (task.workflowStages.length === 0) return 50;
  const stages = new Set(catalogCard?.dimensions.workflowStages ?? []);
  return percentage(
    task.workflowStages.filter((stage) => stages.has(stage)).length,
    task.workflowStages.length,
  );
}

function scoreQualityFit(skill: SkillReference): number {
  const signals = skill.qualitySignals;
  let score = 50;
  if (signals.verifiedPublisher) score += 20;
  if ((signals.userRating ?? 0) >= 4.5) score += 15;
  if ((signals.installCount ?? 0) > 100) score += 10;
  if ((signals.stars ?? 0) > 100) score += 10;
  return Math.min(100, score);
}

function scoreSafetyFit(skill: SkillReference): number {
  if (skill.riskLevel === "low") return 100;
  if (skill.riskLevel === "medium") return 70;
  if (skill.riskLevel === "unknown") return 45;
  return 10;
}

function reasonsForSkill(
  skill: SkillReference,
  matchedKeywords: string[],
  task: TaskProfile,
  scores: {
    catalogCard?: SkillCatalogCard;
    catalogIntentFit: number;
    domainFit: number;
    inputOutputFit: number;
    environmentFit: number;
    workflowFit: number;
  },
): string[] {
  const reasons: string[] = [];
  if (matchedKeywords.length > 0) {
    reasons.push(
      `Matches task keywords: ${matchedKeywords.slice(0, 8).join(", ")}.`,
    );
  }
  if (task.domain && skill.tags.includes(task.domain)) {
    reasons.push(`Skill tags include the inferred domain "${task.domain}".`);
  }
  if (scores.catalogIntentFit > 0) {
    reasons.push(`Catalog intent fit is ${scores.catalogIntentFit}/100.`);
  }
  if (task.domain && scores.domainFit > 0) {
    reasons.push(`Catalog domain matches "${task.domain}".`);
  }
  if (
    task.outputRequirements.some((output) =>
      skill.outputFormats.includes(output),
    )
  ) {
    reasons.push("Output requirements match the skill metadata.");
  }
  if (task.environments.length > 0 && scores.environmentFit > 0) {
    reasons.push(
      `Environment fit covers ${task.environments.join(", ")} at ${scores.environmentFit}/100.`,
    );
  }
  if (task.workflowStages.length > 0 && scores.workflowFit > 0) {
    reasons.push(
      `Workflow stage fit covers ${task.workflowStages.join(", ")} at ${scores.workflowFit}/100.`,
    );
  }
  if (reasons.length === 0) {
    reasons.push("Matched by indexed metadata and skill body text.");
  }
  return reasons;
}

function coversForSkill(
  skill: SkillReference,
  matchedKeywords: string[],
  catalogCard?: SkillCatalogCard,
): string[] {
  const covers = new Set<string>();
  for (const capability of skill.capabilities) covers.add(capability);
  for (const intent of catalogCard?.dimensions.intents ?? [])
    covers.add(intent);
  for (const domain of catalogCard?.dimensions.domains ?? [])
    covers.add(domain);
  for (const keyword of matchedKeywords.slice(0, 5)) covers.add(keyword);
  return Array.from(covers).slice(0, 8);
}

function missingForSkill(
  skill: SkillReference,
  task: TaskProfile,
  catalogCard?: SkillCatalogCard,
): string[] {
  const missing: string[] = [];
  const inputFormats = new Set([
    ...skill.inputFormats,
    ...(catalogCard?.dimensions.inputFormats ?? []),
  ]);
  const outputFormats = new Set([
    ...skill.outputFormats,
    ...(catalogCard?.dimensions.outputFormats ?? []),
  ]);
  const environments = new Set(catalogCard?.dimensions.environments ?? []);
  for (const input of task.fileTypes) {
    if (!inputFormats.has(input)) {
      missing.push(`No explicit ${input} input support in metadata.`);
    }
  }
  for (const output of task.outputRequirements) {
    if (!outputFormats.has(output)) {
      missing.push(`No explicit ${output} output support in metadata.`);
    }
  }
  for (const environment of task.environments) {
    if (!environments.has(environment)) {
      missing.push(
        `No explicit ${environment} environment support in catalog.`,
      );
    }
  }
  return missing;
}

function hasInputOutputRequirement(task: TaskProfile): boolean {
  return task.fileTypes.length > 0 || task.outputRequirements.length > 0;
}

function risksForSkill(skill: SkillReference): string[] {
  if (skill.riskLevel === "unknown") {
    return ["Risk is unknown until the skill is scanned in detail."];
  }
  return [`Risk level is ${skill.riskLevel}.`];
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
