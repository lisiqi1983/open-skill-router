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

  it("can skip malformed skills for research indexing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-"));
    await mkdir(path.join(root, "good"), { recursive: true });
    await mkdir(path.join(root, "bad"), { recursive: true });
    await writeFile(
      path.join(root, "good", "SKILL.md"),
      `---
name: good
description: Good skill.
---
Use this good skill.
`,
      "utf8",
    );
    await writeFile(
      path.join(root, "bad", "SKILL.md"),
      `---
name: bad
description: Bad: unquoted colon
---
Use this bad skill.
`,
      "utf8",
    );

    await expect(discoverLocalSkills(root)).rejects.toThrow(
      "Use --skip-invalid",
    );

    const index = await discoverLocalSkills(root, { skipInvalid: true });
    expect(index.skills.map((skill) => skill.skill.name)).toEqual(["good"]);
    expect(index.invalidSkills).toHaveLength(1);
    expect(index.invalidSkills?.[0]?.skillFilePath).toContain("bad");
  });
});
