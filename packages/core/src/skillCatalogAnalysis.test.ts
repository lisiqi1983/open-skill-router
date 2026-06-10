import { describe, expect, it } from "vitest";
import { discoverLocalSkills } from "./discoverLocalSkills.js";
import {
  analyzeSkillCatalog,
  renderSkillCatalogAnalysisMarkdown,
} from "./skillCatalogAnalysis.js";
import { buildSkillCatalog } from "./skillCatalog.js";

describe("analyzeSkillCatalog", () => {
  it("summarizes coverage, tensor slices, and skill profiles", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    const catalog = buildSkillCatalog(index, {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    const analysis = analyzeSkillCatalog(catalog, {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    expect(analysis.schemaVersion).toBe("skillrouter.catalog-analysis/v1");
    expect(analysis.skillCount).toBe(3);
    expect(analysis.skillProfiles).toHaveLength(3);
    expect(analysis.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "domains",
          coveragePercent: 100,
        }),
        expect.objectContaining({
          dimension: "outputFormats",
          coveredSkillCount: 3,
        }),
      ]),
    );

    const domainByOutput = analysis.matrixSlices.find(
      (slice) => slice.name === "domain_by_output",
    );
    expect(domainByOutput?.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowValue: "software",
          columnValue: "markdown",
        }),
      ]),
    );

    const codeReview = analysis.skillProfiles.find(
      (profile) => profile.name === "code-review",
    );
    expect(codeReview?.riskLevel).toBe("medium");
    expect(codeReview?.vectorKey).toContain("risk=medium");
    expect(codeReview?.primaryDimensions.outputFormats).toContain("markdown");

    const markdown = renderSkillCatalogAnalysisMarkdown(analysis);
    expect(markdown).toContain("# Skill Catalog Analysis");
    expect(markdown).toContain("domain_by_output");
  });
});
