import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m4-"));
const manifestPath = path.join(root, "skillrouter.source.yaml");
const outDir = path.join(root, "public-index");
const registryPath = path.join(root, "sources.json");
const mockSkillsPath = path
  .join(repoRoot, "examples", "mock-skills")
  .replace(/\\/g, "/");

await writeFile(
  manifestPath,
  `schema_version: "skillrouter.source/v1"
name: "mock-static-index"
description: "Smoke test static index."
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
if (manifest.schemaVersion !== "skillrouter.static-index/v1") {
  throw new Error("Static index manifest schema mismatch.");
}
if (manifest.skillCount !== 3) {
  throw new Error(
    `Expected 3 skills in static index, got ${manifest.skillCount}.`,
  );
}
const checksum = await readFile(
  path.join(outDir, "skills.jsonl.sha256"),
  "utf8",
);
if (!checksum.includes(manifest.skillsSha256)) {
  throw new Error("Static index checksum file does not include manifest hash.");
}

const directRecommend = JSON.parse(
  await runCli([
    "recommend",
    "帮我生成一份产品发布 PPT",
    "--source",
    outDir,
    "--json",
  ]),
);
assertPresentationDeck(directRecommend, "direct static source");

await runCli(["source", "add", outDir, "public", "--registry", registryPath]);
const registryRecommend = JSON.parse(
  await runCli([
    "recommend",
    "帮我生成一份产品发布 PPT",
    "--source",
    "public",
    "--source-registry",
    registryPath,
    "--json",
  ]),
);
assertPresentationDeck(registryRecommend, "registered static source");

console.log("Smoke M4 static index passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
  });
  return stdout;
}

function assertPresentationDeck(result, label) {
  const first = result.recommendations?.[0]?.skill?.name;
  if (first !== "presentation-deck") {
    throw new Error(`Expected presentation-deck from ${label}, got ${first}.`);
  }
}
