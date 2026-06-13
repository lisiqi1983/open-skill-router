import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m13-"));
const indexPath = path.join(root, "large-index.json");
const task = "review GitHub PR TypeScript code changes for bugs";

await runCli(["index", "examples/mock-skills", "--out", indexPath]);
const index = JSON.parse(await readFile(indexPath, "utf8"));
const template = index.skills.find(
  (indexedSkill) => indexedSkill.skill.name === "presentation-deck",
);
if (!template) throw new Error("Missing presentation-deck template skill.");

for (let offset = 0; offset < 120; offset += 1) {
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

const result = JSON.parse(
  await runCli([
    "recommend",
    task,
    "--index",
    indexPath,
    "--search-prefilter",
    "--search-max",
    "8",
    "--candidate-pack",
    "--max",
    "3",
    "--json",
  ]),
);

if (result.searchPrefilter?.schemaVersion !== "skillrouter.search/v1") {
  throw new Error("Recommendation should include a search prefilter result.");
}
if (result.searchPrefilter.results.length > 8) {
  throw new Error("Search prefilter exceeded the requested search max.");
}
if (result.recommendations?.[0]?.skill?.name !== "code-review") {
  throw new Error(
    `Expected code-review first, got ${result.recommendations?.[0]?.skill?.name}.`,
  );
}
if ((result.candidatePack?.candidates?.length ?? 0) > 3) {
  throw new Error("Candidate pack should be bounded by max recommendations.");
}
if (
  result.recommendations.some((item) => item.skill.name.startsWith("noise-"))
) {
  throw new Error(
    "Noise skills should not survive the search-prefiltered top recommendations.",
  );
}

console.log("Smoke M13 search prefilter passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}
