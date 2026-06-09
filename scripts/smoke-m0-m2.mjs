import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const cli = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const tempRoot = mkdtempSync(path.join(tmpdir(), "skillrouter-smoke-"));
const home = path.join(tempRoot, "home");
const target = path.join(tempRoot, "agent-skills");
const indexPath = path.join(tempRoot, "index.json");

const indexOutput = runNode([
  "index",
  "examples/mock-skills",
  "--out",
  indexPath,
  "--json",
]);
assertIncludes(indexOutput, '"skillCount": 3');

const recommendOutput = runNode([
  "recommend",
  "帮我生成一份产品发布 PPT",
  "--index",
  indexPath,
]);
assertIncludes(recommendOutput, "Presentation Deck Builder");

const candidatePackOutput = runNode([
  "recommend",
  "分析专利交底书，评估授权概率，输出 PDF 报告",
  "--index",
  indexPath,
  "--candidate-pack",
  "--json",
]);
assertIncludes(
  candidatePackOutput,
  '"schemaVersion": "skillrouter.candidate-pack/v1"',
);
assertIncludes(candidatePackOutput, '"name": "patent-analysis"');

const initOutput = runNode([
  "init",
  "--home",
  home,
  "--target-dir",
  target,
  "--json",
]);
assertIncludes(initOutput, '"homeDir"');
assertFileContains(
  path.join(target, "open-skill-router", "SKILL.md"),
  "Open Skill Router",
);

const localSkill = path.join(tempRoot, "local-skill");
mkdirSync(localSkill, { recursive: true });
writeFileSync(
  path.join(localSkill, "SKILL.md"),
  `---
name: smoke-skill
description: Smoke test skill.
---
# Smoke
`,
  "utf8",
);

const inspectOutput = runNode(["inspect", `local:${localSkill}`, "--json"]);
assertIncludes(inspectOutput, '"riskLevel": "low"');

const installOutput = runNode([
  "install",
  `local:${localSkill}`,
  "--home",
  home,
  "--target-dir",
  target,
  "--json",
]);
assertIncludes(installOutput, '"skillId"');
assertFileContains(path.join(target, "smoke-skill", "SKILL.md"), "Smoke");

const listOutput = runNode(["list", "--home", home, "--json"]);
assertIncludes(listOutput, '"name": "smoke-skill"');

writeFileSync(
  path.join(localSkill, "SKILL.md"),
  `---
name: smoke-skill
description: Smoke test skill.
---
# Smoke

More documentation.
`,
  "utf8",
);
const safeUpdateOutput = runNode([
  "update",
  "--check",
  "--home",
  home,
  "--json",
]);
assertIncludes(safeUpdateOutput, '"classification": "safe"');

mkdirSync(path.join(localSkill, "scripts"), { recursive: true });
writeFileSync(
  path.join(localSkill, "scripts", "run.py"),
  "print('hello')\n",
  "utf8",
);
const confirmationOutput = runNode([
  "update",
  "--check",
  "--home",
  home,
  "--json",
]);
assertIncludes(confirmationOutput, '"classification": "requires_confirmation"');

const pinOutput = runNode([
  "pin",
  `local:${localSkill}`,
  "--home",
  home,
  "--json",
]);
assertIncludes(pinOutput, '"pinned": true');

console.log(`Smoke M0-M2 passed in ${tempRoot}`);

function runNode(args) {
  return run(["node", cli, ...args]);
}

function run(args) {
  return execFileSync(args[0], args.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(
      `Expected output to include ${JSON.stringify(expected)}, received:\n${value}`,
    );
  }
}

function assertFileContains(filePath, expected) {
  const content = readFileSync(filePath, "utf8");
  assertIncludes(content, expected);
}
