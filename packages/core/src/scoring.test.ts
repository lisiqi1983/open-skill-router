import { describe, expect, it } from "vitest";
import {
  resolveRecommendationScoringConfig,
  scoreRecommendationBreakdown,
} from "./scoring.js";

describe("recommendation scoring config", () => {
  it("normalizes partial custom weights", () => {
    const config = resolveRecommendationScoringConfig({
      schemaVersion: "skillrouter.scoring/v1",
      weights: {
        metadataMatch: 1,
        capabilityCoverage: 0,
        catalogIntentFit: 0,
        domainFit: 0,
        inputOutputFit: 0,
        environmentFit: 0,
        workflowFit: 0,
        qualityFit: 0,
        safetyFit: 0,
      },
      modelRerankWeights: {
        deterministicScore: 0,
        userModelRerank: 1,
      },
    });

    expect(config.weights.metadataMatch).toBe(1);
    expect(config.modelRerankWeights.userModelRerank).toBe(1);
    expect(
      scoreRecommendationBreakdown(
        {
          metadataMatch: 42,
          capabilityCoverage: 100,
          catalogIntentFit: 100,
          domainFit: 100,
          inputOutputFit: 100,
          environmentFit: 100,
          workflowFit: 100,
          qualityFit: 100,
          safetyFit: 100,
        },
        config.weights,
      ),
    ).toBe(42);
  });

  it("rejects invalid weights", () => {
    expect(() =>
      resolveRecommendationScoringConfig({
        weights: {
          metadataMatch: -1,
        },
      }),
    ).toThrow(/metadataMatch/);

    expect(() =>
      resolveRecommendationScoringConfig({
        weights: {
          metadataMatch: 0,
          capabilityCoverage: 0,
          catalogIntentFit: 0,
          domainFit: 0,
          inputOutputFit: 0,
          environmentFit: 0,
          workflowFit: 0,
          qualityFit: 0,
          safetyFit: 0,
        },
      }),
    ).toThrow(/positive weight/);
  });
});
