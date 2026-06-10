import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverLocalSkills } from "./discoverLocalSkills.js";
import { parseSourceManifest } from "./sourceManifest.js";
import {
  addSourceRegistryEntry,
  readSourceRegistry,
  resolveSourceRegistryEntry,
} from "./sourceRegistry.js";
import {
  parseStaticSkillRecords,
  readStaticSkillIndex,
  writeStaticSkillIndex,
} from "./staticSnapshot.js";

describe("static skill index", () => {
  it("parses source manifests", () => {
    const manifest = parseSourceManifest(`
schema_version: "skillrouter.source/v1"
name: demo-source
sources:
  - type: local
    path: ./skills
skills:
  - id: demo.skill
    source:
      type: github
      repo: owner/repo
      path: skills/demo
      ref: main
    tags:
      - demo
`);

    expect(manifest).toEqual(
      expect.objectContaining({
        name: "demo-source",
        sources: [expect.objectContaining({ type: "local" })],
        skills: [
          expect.objectContaining({
            id: "demo.skill",
            source: expect.objectContaining({ type: "github" }),
          }),
        ],
      }),
    );
  });

  it("writes and reads a checksummed JSONL snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-static-"));
    const out = path.join(root, "public-index");
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    const result = await writeStaticSkillIndex(index, out, {
      name: "mock-skills",
      description: "Mock skills for tests.",
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    const jsonl = await readFile(result.skillsPath, "utf8");
    expect(parseStaticSkillRecords(jsonl)).toHaveLength(3);
    expect(await readFile(result.checksumPath, "utf8")).toContain(
      result.manifest.skillsSha256,
    );

    const staticIndex = await readStaticSkillIndex(out);
    expect(staticIndex.skills.map((skill) => skill.skill.name)).toEqual([
      "code-review",
      "patent-analysis",
      "presentation-deck",
    ]);
  });

  it("adds and resolves named static sources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-sources-"));
    const registryPath = path.join(root, "sources.json");
    await mkdir(root, { recursive: true });

    await addSourceRegistryEntry(
      { name: "public", url: "https://example.com/skills/" },
      registryPath,
    );

    expect((await readSourceRegistry(registryPath)).sources).toHaveLength(1);
    await expect(
      resolveSourceRegistryEntry("public", registryPath),
    ).resolves.toEqual(
      expect.objectContaining({ url: "https://example.com/skills/" }),
    );
  });
});
