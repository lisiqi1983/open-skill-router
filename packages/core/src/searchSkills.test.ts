import { describe, expect, it } from "vitest";
import { discoverLocalSkills } from "./discoverLocalSkills.js";
import {
  buildSkillSearchIndex,
  localIndexFromSkillSearchIndex,
  searchSkillIndex,
  searchSkills,
} from "./searchSkills.js";

describe("searchSkills", () => {
  it("ranks matching skills across lexical and catalog dimensions", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-13T00:00:00.000Z"),
    });

    const result = searchSkills({
      index,
      query:
        "review GitHub PR TypeScript code changes for bugs and missing tests",
      maxResults: 3,
    });

    expect(result.schemaVersion).toBe("skillrouter.search/v1");
    expect(result.totalSkillCount).toBe(3);
    expect(result.results[0]?.skill.name).toBe("code-review");
    expect(result.results[0]?.scoreBreakdown.lexical).toBeGreaterThan(0);
    expect(result.results[0]?.matchedDimensions).toContain("domain:software");
    expect(result.results[0]?.matchedDimensions).toContain("workflow:verify");
  });

  it("applies risk and domain filters before ranking", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-13T00:00:00.000Z"),
    });

    const result = searchSkills({
      index,
      query: "generate a product launch presentation",
      domains: ["presentation"],
      riskLevels: ["medium"],
      maxResults: 5,
    });

    expect(result.filteredSkillCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.skill.name).toBe("presentation-deck");
  });

  it("can search a persistent prebuilt search index", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-13T00:00:00.000Z"),
    });
    const searchIndex = buildSkillSearchIndex(index);

    const result = searchSkillIndex({
      searchIndex,
      query:
        "review GitHub PR TypeScript code changes for bugs and missing tests",
      maxResults: 3,
    });

    expect(searchIndex.schemaVersion).toBe("skillrouter.search-index/v1");
    expect(searchIndex.skillCount).toBe(3);
    expect(searchIndex.documents[0]?.tokenCount).toBeGreaterThan(0);
    expect(Object.keys(searchIndex.documentFrequencies).length).toBeGreaterThan(
      0,
    );
    expect(result.results[0]?.skill.name).toBe("code-review");
    expect(localIndexFromSkillSearchIndex(searchIndex).skills).toHaveLength(3);
  });
});
