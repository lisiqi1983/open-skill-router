import { describe, expect, it } from "vitest";
import { discoverLocalSkills } from "./discoverLocalSkills.js";
import { recommendSkills } from "./recommend.js";

describe("recommendSkills", () => {
  it("ranks presentation skills for PPT tasks", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-09T00:00:00.000Z"),
    });
    const result = recommendSkills({
      index,
      task: "帮我生成一份产品发布 PPT",
      maxResults: 3,
    });

    expect(result.recommendations[0]?.skill.name).toBe("presentation-deck");
    expect(result.recommendations[0]?.score).toBeGreaterThan(40);
  });

  it("can produce a candidate pack for model rerank", async () => {
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-09T00:00:00.000Z"),
    });
    const result = recommendSkills({
      index,
      task: "分析专利交底书，评估授权概率，输出 PDF 报告",
      maxResults: 2,
      mode: "full_skill_rerank",
    });

    expect(result.candidatePack?.schemaVersion).toBe(
      "skillrouter.candidate-pack/v1",
    );
    expect(result.candidatePack?.candidates[0]?.skill.name).toBe(
      "patent-analysis",
    );
  });
});
