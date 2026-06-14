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
  checkStaticSourceHealth,
  loadStaticSkillIndex,
  parseStaticSkillRecords,
  readStaticSkillIndex,
  readStaticSkillSearchIndex,
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
    expect(result.manifest.searchIndexPath).toBe("search-index.json");
    expect(result.manifest.searchIndexChecksumPath).toBe(
      "search-index.json.sha256",
    );
    expect(result.manifest.searchIndexSha256).toMatch(/^sha256:/);
    expect(await readFile(result.searchIndexChecksumPath, "utf8")).toContain(
      result.manifest.searchIndexSha256,
    );

    const staticIndex = await readStaticSkillIndex(out);
    expect(staticIndex.skills.map((skill) => skill.skill.name)).toEqual([
      "code-review",
      "patent-analysis",
      "presentation-deck",
    ]);

    const searchIndex = await readStaticSkillSearchIndex(out);
    expect(searchIndex.schemaVersion).toBe("skillrouter.search-index/v1");
    expect(searchIndex.skillCount).toBe(3);
  });

  it("adds and resolves named static sources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-sources-"));
    const registryPath = path.join(root, "sources.json");
    await mkdir(root, { recursive: true });

    await addSourceRegistryEntry(
      {
        name: "public",
        url: "https://example.com/skills/",
        mirrors: ["https://mirror.example.com/skills/"],
      },
      registryPath,
    );

    expect((await readSourceRegistry(registryPath)).sources).toHaveLength(1);
    await expect(
      resolveSourceRegistryEntry("public", registryPath),
    ).resolves.toEqual(
      expect.objectContaining({
        url: "https://example.com/skills/",
        mirrors: ["https://mirror.example.com/skills/"],
      }),
    );
  });

  it("fails over from an unavailable source to a mirror", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-failover-"));
    const out = path.join(root, "public-index");
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    await writeStaticSkillIndex(index, out, {
      name: "mock-skills",
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    const loaded = await readStaticSkillIndex(["missing-source", out]);
    expect(loaded.sourceRoot).toBe(out);
    expect(loaded.skills).toHaveLength(3);
  });

  it("caches remote snapshots and falls back to cache", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-cache-"));
    const out = path.join(root, "public-index");
    const cache = path.join(root, "cache");
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    await writeStaticSkillIndex(index, out, {
      name: "mock-skills",
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    const files = await staticFilesForFetch(out);
    const fetchOk = fakeFetch(files);
    const source = "https://example.com/index/";
    const first = await loadStaticSkillIndex(source, {
      fetchImpl: fetchOk,
      cacheDir: cache,
    });
    expect(first.index.skills).toHaveLength(3);
    expect(first.searchIndex?.skillCount).toBe(3);

    const second = await loadStaticSkillIndex(source, {
      fetchImpl: fakeFetch({}),
      cacheDir: cache,
    });
    expect(second.index.skills).toHaveLength(3);
    expect(second.searchIndex?.skillCount).toBe(3);

    const searchOnlyCache = path.join(root, "search-cache");
    const searchFirst = await readStaticSkillSearchIndex(source, {
      fetchImpl: fetchOk,
      cacheDir: searchOnlyCache,
    });
    expect(searchFirst.skillCount).toBe(3);
    const searchSecond = await readStaticSkillSearchIndex(source, {
      fetchImpl: fakeFetch({}),
      cacheDir: searchOnlyCache,
    });
    expect(searchSecond.skillCount).toBe(3);
  });

  it("reports source health and checksum mismatches across mirrors", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-health-"));
    const primary = path.join(root, "primary");
    const mirror = path.join(root, "mirror");
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    await writeStaticSkillIndex(index, primary, {
      name: "primary",
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    await writeStaticSkillIndex(
      { ...index, skills: index.skills.slice(0, 2) },
      mirror,
      {
        name: "mirror",
        now: new Date("2026-06-10T00:00:00.000Z"),
      },
    );

    const report = await checkStaticSourceHealth("public", [primary, mirror], {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    expect(report.checks).toEqual([
      expect.objectContaining({
        source: primary,
        ok: true,
        role: "primary",
        checksumMatchesPrimary: true,
        searchIndexSha256: expect.stringMatching(/^sha256:/),
        searchIndexChecksumMatchesPrimary: true,
      }),
      expect.objectContaining({
        source: mirror,
        ok: true,
        role: "mirror",
        checksumMatchesPrimary: false,
        searchIndexSha256: expect.stringMatching(/^sha256:/),
        searchIndexChecksumMatchesPrimary: false,
      }),
    ]);
  });
});

async function staticFilesForFetch(
  out: string,
): Promise<Record<string, string>> {
  return {
    "https://example.com/index/index.json": await readFile(
      path.join(out, "index.json"),
      "utf8",
    ),
    "https://example.com/index/skills.jsonl": await readFile(
      path.join(out, "skills.jsonl"),
      "utf8",
    ),
    "https://example.com/index/search-index.json": await readFile(
      path.join(out, "search-index.json"),
      "utf8",
    ),
  };
}

function fakeFetch(files: Record<string, string>): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const content = files[url];
    if (content === undefined) {
      return new Response("not found", { status: 404 });
    }
    return new Response(content, { status: 200 });
  }) as typeof fetch;
}
