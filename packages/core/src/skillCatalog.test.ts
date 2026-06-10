import { describe, expect, it } from "vitest";
import { discoverLocalSkills } from "./discoverLocalSkills.js";
import { buildSkillCatalog } from "./skillCatalog.js";

describe("buildSkillCatalog", () => {
  it("builds multidimensional cards for indexed skills", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    const catalog = buildSkillCatalog(index, {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    expect(catalog.schemaVersion).toBe("skillrouter.catalog/v1");
    expect(catalog.skillCount).toBe(3);
    expect(catalog.summary.sourceTypes).toEqual([{ value: "local", count: 3 }]);
    expect(catalog.summary.domains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "presentation" }),
        expect.objectContaining({ value: "patent" }),
        expect.objectContaining({ value: "software" }),
      ]),
    );

    const presentation = catalog.cards.find(
      (card) => card.name === "presentation-deck",
    );
    expect(presentation?.dimensions.outputFormats).toContain("pptx");
    expect(presentation?.dimensions.workflowStages).toContain("author");
  });
});
