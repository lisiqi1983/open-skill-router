import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m12-"));
const localIndexPath = path.join(root, "local-index.json");
const staticIndexDir = path.join(root, "public", "open-skill-router", "index");

await mkdir(staticIndexDir, { recursive: true });
await runCli(["index", "examples/mock-skills", "--out", localIndexPath]);

const localSearch = JSON.parse(
  await runCli([
    "search",
    "review GitHub PR TypeScript code changes",
    "--index",
    localIndexPath,
    "--json",
  ]),
);
assertSearch(localSearch, {
  label: "local search",
  expectedFirstSkill: "code-review",
  minSkillCount: 3,
});

const filteredSearch = JSON.parse(
  await runCli([
    "search",
    "generate product launch slides",
    "--index",
    localIndexPath,
    "--domain",
    "presentation",
    "--risk",
    "medium",
    "--json",
  ]),
);
assertSearch(filteredSearch, {
  label: "filtered search",
  expectedFirstSkill: "presentation-deck",
  minSkillCount: 1,
});

await runCli([
  "index-source",
  "skillrouter.source.yaml",
  "--out",
  staticIndexDir,
]);

const server = createStaticServer(path.join(root, "public"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected static source server to listen on a TCP port.");
  }
  const remoteSource = `http://127.0.0.1:${address.port}/open-skill-router/index/`;
  const remoteSearch = JSON.parse(
    await runCli([
      "search",
      "discover install skills",
      "--source",
      remoteSource,
      "--json",
    ]),
  );

  assertSearch(remoteSearch, {
    label: "remote search",
    expectedFirstSkill: "open-skill-router",
    minSkillCount: 4,
  });
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke M12 search passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertSearch(result, options) {
  if (result.schemaVersion !== "skillrouter.search/v1") {
    throw new Error(`${options.label} has invalid schema.`);
  }
  if (result.totalSkillCount < options.minSkillCount) {
    throw new Error(`${options.label} searched too few skills.`);
  }
  if (!Array.isArray(result.results) || result.results.length === 0) {
    throw new Error(`${options.label} returned no hits.`);
  }
  if (result.results[0].skill.name !== options.expectedFirstSkill) {
    throw new Error(
      `${options.label} expected ${options.expectedFirstSkill}, got ${result.results[0].skill.name}.`,
    );
  }
  if (typeof result.results[0].scoreBreakdown?.lexical !== "number") {
    throw new Error(`${options.label} missing score breakdown.`);
  }
}

function createStaticServer(rootDir) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const decodedPath = decodeURIComponent(url.pathname);
      const safePath = decodedPath.replace(/^\/+/, "");
      const filePath = path.resolve(rootDir, safePath);
      if (!filePath.startsWith(path.resolve(rootDir))) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const statPath = filePath.endsWith(path.sep)
        ? path.join(filePath, "index.json")
        : filePath;
      const content = await readFile(statPath);
      response.writeHead(200, {
        "content-type": contentType(statPath),
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".jsonl")) return "application/jsonl";
  return "text/plain";
}
