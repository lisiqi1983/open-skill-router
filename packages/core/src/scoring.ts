import type {
  ModelRerankScoringWeights,
  RecommendationScoreBreakdown,
  RecommendationScoringConfig,
  RecommendationScoringWeights,
  ResolvedRecommendationScoringConfig,
} from "./types.js";

export const SCORING_SCHEMA_VERSION = "skillrouter.scoring/v1";

export const DEFAULT_RECOMMENDATION_SCORING_WEIGHTS: RecommendationScoringWeights =
  {
    metadataMatch: 0.2,
    capabilityCoverage: 0.15,
    catalogIntentFit: 0.2,
    domainFit: 0.15,
    inputOutputFit: 0.2,
    environmentFit: 0.08,
    workflowFit: 0.07,
    qualityFit: 0.03,
    safetyFit: 0.02,
  };

export const DEFAULT_MODEL_RERANK_SCORING_WEIGHTS: ModelRerankScoringWeights = {
  deterministicScore: 0.75,
  userModelRerank: 0.25,
};

export function resolveRecommendationScoringConfig(
  config: RecommendationScoringConfig = {},
): ResolvedRecommendationScoringConfig {
  if (
    config.schemaVersion !== undefined &&
    config.schemaVersion !== SCORING_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported scoring schema version: ${String(config.schemaVersion)}.`,
    );
  }

  return {
    weights: normalizeWeights(
      {
        ...DEFAULT_RECOMMENDATION_SCORING_WEIGHTS,
        ...(config.weights ?? {}),
      },
      Object.keys(DEFAULT_RECOMMENDATION_SCORING_WEIGHTS) as Array<
        keyof RecommendationScoringWeights
      >,
      "weights",
    ),
    modelRerankWeights: normalizeWeights(
      {
        ...DEFAULT_MODEL_RERANK_SCORING_WEIGHTS,
        ...(config.modelRerankWeights ?? {}),
      },
      Object.keys(DEFAULT_MODEL_RERANK_SCORING_WEIGHTS) as Array<
        keyof ModelRerankScoringWeights
      >,
      "modelRerankWeights",
    ),
  };
}

export function scoreRecommendationBreakdown(
  breakdown: RecommendationScoreBreakdown,
  weights: RecommendationScoringWeights,
): number {
  return clampScore(
    weights.metadataMatch * breakdown.metadataMatch +
      weights.capabilityCoverage * breakdown.capabilityCoverage +
      weights.catalogIntentFit * (breakdown.catalogIntentFit ?? 0) +
      weights.domainFit * (breakdown.domainFit ?? 0) +
      weights.inputOutputFit * breakdown.inputOutputFit +
      weights.environmentFit * (breakdown.environmentFit ?? 0) +
      weights.workflowFit * (breakdown.workflowFit ?? 0) +
      weights.qualityFit * (breakdown.qualityFit ?? 0) +
      weights.safetyFit * breakdown.safetyFit,
  );
}

export function mergeModelRerankScore(
  deterministicScore: number,
  userModelRerank: number,
  weights: ModelRerankScoringWeights = DEFAULT_MODEL_RERANK_SCORING_WEIGHTS,
): number {
  return clampScore(
    weights.deterministicScore * deterministicScore +
      weights.userModelRerank * userModelRerank,
  );
}

function normalizeWeights<T extends Record<string, number>>(
  weights: T,
  keys: Array<keyof T>,
  path: string,
): T {
  let total = 0;
  const normalized = {} as T;

  for (const key of keys) {
    const value = weights[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${path}.${String(key)} must be a non-negative number.`);
    }
    total += value;
  }

  if (total <= 0) {
    throw new Error(`${path} must contain at least one positive weight.`);
  }

  for (const key of keys) {
    normalized[key] = (weights[key] / total) as T[typeof key];
  }
  return normalized;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
