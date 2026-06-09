import { describe, expect, it } from "vitest";
import { parseSkillMd } from "./parseSkillMd.js";

describe("parseSkillMd", () => {
  it("parses YAML frontmatter and normalizes skill fields", () => {
    const parsed = parseSkillMd(`---
name: ppt-generator
display_name: PPT Generator
description: Builds slide decks.
tags:
  - ppt
  - presentation
capabilities: outline, slides
input_formats:
  - markdown
output_formats:
  - pptx
languages:
  - en
---
# PPT Generator

Use this skill to create slides.
`);

    expect(parsed.name).toBe("ppt-generator");
    expect(parsed.displayName).toBe("PPT Generator");
    expect(parsed.description).toBe("Builds slide decks.");
    expect(parsed.tags).toEqual(["ppt", "presentation"]);
    expect(parsed.capabilities).toEqual(["outline", "slides"]);
    expect(parsed.inputFormats).toEqual(["markdown"]);
    expect(parsed.outputFormats).toEqual(["pptx"]);
    expect(parsed.languages).toEqual(["en"]);
    expect(parsed.body).toContain("Use this skill");
  });

  it("falls back to the first non-heading paragraph when description is absent", () => {
    const parsed = parseSkillMd(
      `# Title

This skill reviews code.
`,
      { fallbackName: "code-review" },
    );

    expect(parsed.name).toBe("code-review");
    expect(parsed.description).toBe("This skill reviews code.");
  });
});
