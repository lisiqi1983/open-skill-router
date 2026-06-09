import { mkdir, writeFile, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installGenericAgentSkill } from "./genericAgentHost.js";

describe("installGenericAgentSkill", () => {
  it("copies a cached skill into the generic target directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-agent-"));
    const cache = path.join(root, "cache");
    const target = path.join(root, "target");
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, "SKILL.md"), "# Skill\n", "utf8");

    const result = await installGenericAgentSkill({
      skillCachePath: cache,
      skillName: "demo skill",
      scope: "user",
      targetDir: target,
    });

    expect(result.installPath).toBe(path.join(target, "demo-skill"));
    expect(
      await readFile(path.join(result.installPath, "SKILL.md"), "utf8"),
    ).toBe("# Skill\n");
  });
});
