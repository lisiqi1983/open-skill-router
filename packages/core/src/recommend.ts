import type { SkillReference } from "@openskillrouter/skill-spec";
import { buildCandidatePack } from "./candidatePack.js";
import { profileTask } from "./taskProfile.js";
import { tokenizeText } from "./tokenize.js";
import type {
  IndexedSkill,
  RecommendSkillsOptions,
  RecommendSkillsResult,
  SkillRecommendation,
  TaskProfile,
} from "./types.js";

export function recommendSkills(
  options: RecommendSkillsOptions,
): RecommendSkillsResult {
  const task = profileTask(options.task, { privacyMode: options.privacyMode });
  const scored = options.index.skills
    .map((indexedSkill) => scoreSkill(indexedSkill, task))
    .filter((recommendation) => recommendation.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, options.maxResults ?? 5)
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1,
    }));

  const mode = options.mode ?? "fast_metadata";

  return {
    task,
    recommendations: scored,
    candidatePack:
      mode === "full_skill_rerank" || mode === "strict_local"
        ? buildCandidatePack({
            mode,
            task,
            recommendations: scored,
            indexedSkills: options.index.skills,
          })
        : undefined,
  };
}

function scoreSkill(
  indexedSkill: IndexedSkill,
  task: TaskProfile,
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
  );
  const inputOutputFit = scoreInputOutputFit(indexedSkill.skill, task);
  const safetyFit = scoreSafetyFit(indexedSkill.skill);
  const hasRelevanceEvidence =
    metadataMatch > 0 || capabilityCoverage > 0 || inputOutputFit > 0;
  const score = Math.round(
    hasRelevanceEvidence
      ? 0.4 * metadataMatch +
          0.25 * capabilityCoverage +
          0.2 * inputOutputFit +
          0.15 * safetyFit
      : 0,
  );
  const risks = risksForSkill(indexedSkill.skill);
  const reasons = reasonsForSkill(indexedSkill.skill, matchedKeywords, task);
  const covers = coversForSkill(indexedSkill.skill, matchedKeywords);
  const missing = missingForSkill(indexedSkill.skill, task);

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
    scoreBreakdown: {
      metadataMatch,
      capabilityCoverage,
      inputOutputFit,
      safetyFit,
    },
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
): number {
  const capabilityText =
    `${skill.tags.join(" ")} ${skill.capabilities.join(" ")} ${skill.intents.join(" ")}`.toLowerCase();
  const directMatches = matchedKeywords.filter((keyword) =>
    capabilityText.includes(keyword),
  ).length;
  const intentMatches = task.intents.filter((intent) =>
    capabilityText.includes(intent),
  ).length;

  return Math.min(100, directMatches * 25 + intentMatches * 35);
}

function scoreInputOutputFit(skill: SkillReference, task: TaskProfile): number {
  const inputMatches = task.fileTypes.filter((fileType) =>
    skill.inputFormats.includes(fileType),
  ).length;
  const outputMatches = task.outputRequirements.filter((output) =>
    skill.outputFormats.includes(output),
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
  if (
    task.outputRequirements.some((output) =>
      skill.outputFormats.includes(output),
    )
  ) {
    reasons.push("Output requirements match the skill metadata.");
  }
  if (reasons.length === 0) {
    reasons.push("Matched by indexed metadata and skill body text.");
  }
  return reasons;
}

function coversForSkill(
  skill: SkillReference,
  matchedKeywords: string[],
): string[] {
  const covers = new Set<string>();
  for (const capability of skill.capabilities) covers.add(capability);
  for (const keyword of matchedKeywords.slice(0, 5)) covers.add(keyword);
  return Array.from(covers).slice(0, 8);
}

function missingForSkill(skill: SkillReference, task: TaskProfile): string[] {
  const missing: string[] = [];
  for (const output of task.outputRequirements) {
    if (!skill.outputFormats.includes(output)) {
      missing.push(`No explicit ${output} output support in metadata.`);
    }
  }
  return missing;
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
