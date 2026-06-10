import type { SkillRecommendation } from "./types.js";
import {
  MODEL_RERANK_GUARDRAILS,
  MODEL_RERANK_OUTPUT_SCHEMA,
} from "./modelRerank.js";
import type {
  CandidatePack,
  IndexedSkill,
  RecommendationMode,
  TaskProfile,
} from "./types.js";

export interface BuildCandidatePackOptions {
  mode: RecommendationMode;
  task: TaskProfile;
  recommendations: SkillRecommendation[];
  indexedSkills: IndexedSkill[];
  maxSkillBodyChars?: number;
}

export function buildCandidatePack(
  options: BuildCandidatePackOptions,
): CandidatePack {
  const maxSkillBodyChars = options.maxSkillBodyChars ?? 4000;
  const skillsById = new Map(
    options.indexedSkills.map((indexedSkill) => [
      indexedSkill.skill.id,
      indexedSkill,
    ]),
  );

  return {
    schemaVersion: "skillrouter.candidate-pack/v1",
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    task: options.task,
    limits: {
      maxCandidates: options.recommendations.length,
      maxSkillBodyChars,
    },
    rerankContract: {
      guardrails: [...MODEL_RERANK_GUARDRAILS],
      outputSchema: MODEL_RERANK_OUTPUT_SCHEMA,
    },
    candidates: options.recommendations.map((recommendation) => {
      const indexedSkill = skillsById.get(recommendation.skill.id);
      return {
        skill: recommendation.skill,
        deterministicScore: recommendation.score,
        matchedKeywords: recommendation.matchedKeywords,
        bodyExcerpt: excerpt(indexedSkill?.body ?? "", maxSkillBodyChars),
        fileTree: ["SKILL.md"],
        riskSummary: {
          level: recommendation.skill.riskLevel,
          reasons: recommendation.risks,
        },
      };
    }),
  };
}

function excerpt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated]`;
}
