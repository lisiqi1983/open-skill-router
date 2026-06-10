import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createSkillRouterApiServer } from "../apps/api/dist/index.js";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m9-"));
const indexPath = path.join(root, "index.json");
const scoringPath = path.join(root, "metadata-only.scoring.json");
const task = "review TypeScript code for bugs and missing tests";

await writeFile(
  scoringPath,
  `${JSON.stringify(
    {
      schemaVersion: "skillrouter.scoring/v1",
      weights: {
        metadataMatch: 1,
        capabilityCoverage: 0,
        catalogIntentFit: 0,
        domainFit: 0,
        inputOutputFit: 0,
        environmentFit: 0,
        workflowFit: 0,
        qualityFit: 0,
        safetyFit: 0,
      },
      modelRerankWeights: {
        deterministicScore: 0,
        userModelRerank: 1,
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

await runCli(["index", "examples/mock-skills", "--out", indexPath]);

const localResult = JSON.parse(
  await runCli([
    "recommend",
    task,
    "--index",
    indexPath,
    "--scoring",
    scoringPath,
    "--json",
  ]),
);
assertMetadataOnlyScore(localResult, "local CLI");

const server = createSkillRouterApiServer({
  indexPath,
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected API server to listen on a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const apiResult = JSON.parse(
    await runCli([
      "recommend",
      task,
      "--api",
      baseUrl,
      "--scoring",
      scoringPath,
      "--json",
    ]),
  );
  assertMetadataOnlyScore(apiResult, "CLI API");
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke M9 scoring config passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertMetadataOnlyScore(result, label) {
  const first = result.recommendations?.[0];
  if (first?.skill?.name !== "code-review") {
    throw new Error(`Expected code-review first from ${label}.`);
  }
  if (first.score !== first.scoreBreakdown?.metadataMatch) {
    throw new Error(
      `${label} did not use metadata-only scoring: ${JSON.stringify(first.scoreBreakdown)}`,
    );
  }
}
