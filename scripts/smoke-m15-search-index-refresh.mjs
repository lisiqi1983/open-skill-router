import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m15-"));
const indexPath = path.join(root, "index.json");
const searchIndexPath = path.join(root, "search-index.json");
const task = "review GitHub PR TypeScript code changes for bugs";

await runCli(["index", "examples/mock-skills", "--out", indexPath]);

const initialBuild = JSON.parse(
  await runCli([
    "search-index",
    "build",
    "--index",
    indexPath,
    "--out",
    searchIndexPath,
    "--json",
  ]),
);

if (initialBuild.searchIndex?.schemaVersion !== "skillrouter.search-index/v1") {
  throw new Error("Initial search-index build schema mismatch.");
}
if (!initialBuild.searchIndex.sourceIndexFingerprint) {
  throw new Error("Search index should include a source fingerprint.");
}
if (initialBuild.rebuiltDocumentCount !== 3) {
  throw new Error("Initial build should rebuild all mock skill documents.");
}

const freshStatus = JSON.parse(
  await runCli([
    "search-index",
    "status",
    "--index",
    indexPath,
    "--search-index",
    searchIndexPath,
    "--json",
  ]),
);

if (freshStatus.status !== "fresh") {
  throw new Error(`Expected fresh status, got ${freshStatus.status}.`);
}

const skippedBuild = JSON.parse(
  await runCli([
    "search-index",
    "build",
    "--index",
    indexPath,
    "--out",
    searchIndexPath,
    "--if-stale",
    "--json",
  ]),
);

if (skippedBuild.skipped !== true) {
  throw new Error("--if-stale should skip when the search index is fresh.");
}

const sourceIndex = JSON.parse(await readFile(indexPath, "utf8"));
const codeReview = sourceIndex.skills.find(
  (indexedSkill) => indexedSkill.skill.name === "code-review",
);
if (!codeReview) throw new Error("Missing code-review skill.");
codeReview.body += "\nAdditional M15 TypeScript review guidance.";
await writeFile(indexPath, `${JSON.stringify(sourceIndex, null, 2)}\n`, "utf8");

const staleStatus = JSON.parse(
  await runCli([
    "search-index",
    "status",
    "--index",
    indexPath,
    "--search-index",
    searchIndexPath,
    "--json",
  ]),
);

if (staleStatus.status !== "stale") {
  throw new Error(`Expected stale status, got ${staleStatus.status}.`);
}
if (!staleStatus.staleSkillIds.includes("local:code-review")) {
  throw new Error("Changed code-review skill should be marked stale.");
}

const incrementalBuild = JSON.parse(
  await runCli([
    "search-index",
    "build",
    "--index",
    indexPath,
    "--out",
    searchIndexPath,
    "--incremental",
    "--json",
  ]),
);

if (incrementalBuild.reusedDocumentCount < 2) {
  throw new Error("Incremental build should reuse unchanged skill documents.");
}
if (incrementalBuild.rebuiltDocumentCount !== 1) {
  throw new Error(
    "Incremental build should rebuild exactly one changed skill.",
  );
}

const finalStatus = JSON.parse(
  await runCli([
    "search-index",
    "status",
    "--index",
    indexPath,
    "--search-index",
    searchIndexPath,
    "--json",
  ]),
);

if (finalStatus.status !== "fresh") {
  throw new Error("Incremental rebuild should refresh the search index.");
}

const searchResult = JSON.parse(
  await runCli([
    "search",
    task,
    "--search-index",
    searchIndexPath,
    "--max",
    "3",
    "--json",
  ]),
);

if (searchResult.results?.[0]?.skill?.name !== "code-review") {
  throw new Error("Persistent search should still rank code-review first.");
}

console.log("Smoke M15 search index refresh passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}
