import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m14-"));
const indexPath = path.join(root, "large-index.json");
const searchIndexPath = path.join(root, "search-index.json");
const task = "review GitHub PR TypeScript code changes for bugs";

await runCli(["index", "examples/mock-skills", "--out", indexPath]);
const index = JSON.parse(await readFile(indexPath, "utf8"));
const template = index.skills.find(
  (indexedSkill) => indexedSkill.skill.name === "presentation-deck",
);
if (!template) throw new Error("Missing presentation-deck template skill.");

for (let offset = 0; offset < 150; offset += 1) {
  index.skills.push({
    ...template,
    skillFilePath: `noise-${offset}/SKILL.md`,
    rootPath: `noise-${offset}`,
    body: "Unrelated gardening recipe travel itinerary planning notes.",
    skill: {
      ...template.skill,
      id: `local:noise-${offset}`,
      locator: `local:noise-${offset}`,
      name: `noise-${offset}`,
      displayName: `Noise ${offset}`,
      description:
        "Unrelated gardening recipe travel itinerary planning notes.",
      tags: ["noise"],
      capabilities: [],
      intents: [],
      inputFormats: [],
      outputFormats: [],
      metadataHash: `noise-${offset}`,
    },
  });
}
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

await runCli([
  "search-index",
  "build",
  "--index",
  indexPath,
  "--out",
  searchIndexPath,
]);
const searchIndex = JSON.parse(await readFile(searchIndexPath, "utf8"));

if (searchIndex.schemaVersion !== "skillrouter.search-index/v1") {
  throw new Error("Persistent search index schema mismatch.");
}
if (searchIndex.skillCount !== index.skills.length) {
  throw new Error("Persistent search index skill count mismatch.");
}
if (!searchIndex.documents?.[0]?.tokenCounts) {
  throw new Error("Persistent search index should contain token counts.");
}

const searchResult = JSON.parse(
  await runCli([
    "search",
    task,
    "--search-index",
    searchIndexPath,
    "--max",
    "5",
    "--json",
  ]),
);

if (searchResult.results?.[0]?.skill?.name !== "code-review") {
  throw new Error(
    `Expected code-review first in persistent search, got ${searchResult.results?.[0]?.skill?.name}.`,
  );
}

const recommendation = JSON.parse(
  await runCli([
    "recommend",
    task,
    "--search-index",
    searchIndexPath,
    "--search-max",
    "8",
    "--candidate-pack",
    "--max",
    "3",
    "--json",
  ]),
);

if (recommendation.searchPrefilter?.schemaVersion !== "skillrouter.search/v1") {
  throw new Error("Persistent search-index recommendation should prefilter.");
}
if (recommendation.searchPrefilter.results.length > 8) {
  throw new Error("Persistent search prefilter exceeded requested max.");
}
if (recommendation.recommendations?.[0]?.skill?.name !== "code-review") {
  throw new Error(
    `Expected code-review first in persistent recommendation, got ${recommendation.recommendations?.[0]?.skill?.name}.`,
  );
}
if (
  recommendation.recommendations.some((item) =>
    item.skill.name.startsWith("noise-"),
  )
) {
  throw new Error(
    "Noise skills should not survive persistent search prefilter.",
  );
}

console.log("Smoke M14 persistent search index passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}
