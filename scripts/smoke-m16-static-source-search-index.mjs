#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m16-"));
const manifestPath = path.join(root, "skillrouter.source.yaml");
const outDir = path.join(root, "public-index");
const mockSkillsPath = path
  .join(repoRoot, "examples", "mock-skills")
  .replace(/\\/g, "/");

await writeFile(
  manifestPath,
  `schema_version: "skillrouter.source/v1"
name: "mock-static-search-index"
description: "Smoke test static source search index."
sources:
  - type: local
    path: "${mockSkillsPath}"
    tags:
      - smoke
`,
  "utf8",
);

await runCli(["index-source", manifestPath, "--out", outDir, "--json"]);

const manifest = JSON.parse(
  await readFile(path.join(outDir, "index.json"), "utf8"),
);
if (manifest.searchIndexPath !== "search-index.json") {
  throw new Error("Static source manifest is missing search-index.json.");
}
if (!manifest.searchIndexSha256?.startsWith("sha256:")) {
  throw new Error("Static source manifest is missing search index checksum.");
}

const searchIndex = JSON.parse(
  await readFile(path.join(outDir, "search-index.json"), "utf8"),
);
if (
  searchIndex.schemaVersion !== "skillrouter.search-index/v1" ||
  searchIndex.skillCount !== 3
) {
  throw new Error("Static source search index artifact is invalid.");
}

await rm(path.join(outDir, "skills.jsonl"));
await rm(path.join(outDir, "skills.jsonl.sha256"));

const search = JSON.parse(
  await runCli([
    "search",
    "review TypeScript code changes before merging",
    "--source",
    outDir,
    "--json",
  ]),
);
assertCodeReview(search.results?.[0]?.skill?.name, "static source search");
if (search.totalSkillCount !== 3) {
  throw new Error("Search did not use the static source search index.");
}

const recommend = JSON.parse(
  await runCli([
    "recommend",
    "review TypeScript code changes before merging",
    "--source",
    outDir,
    "--json",
  ]),
);
assertCodeReview(
  recommend.recommendations?.[0]?.skill?.name,
  "static source recommendation",
);
if (recommend.searchPrefilter?.totalSkillCount !== 3) {
  throw new Error("Recommend did not auto-use the static source search index.");
}

console.log("Smoke M16 static source search index passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertCodeReview(actual, label) {
  if (actual !== "code-review") {
    throw new Error(`Expected code-review from ${label}, got ${actual}.`);
  }
}
