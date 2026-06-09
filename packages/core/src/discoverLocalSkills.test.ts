import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverLocalSkills } from "./discoverLocalSkills.js";

describe("discoverLocalSkills", () => {
  it("finds SKILL.md files recursively", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-"));
    await mkdir(path.join(root, "skills", "example"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "example", "SKILL.md"),
      `---
name: example
description: Example skill.
tags: [example]
---
Use this example skill.
`,
      "utf8",
    );

    const index = await discoverLocalSkills(root, {
      now: new Date("2026-06-09T00:00:00.000Z"),
    });

    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]?.skill.name).toBe("example");
    expect(index.skills[0]?.skill.locator).toBe("local:skills/example");
  });
});
