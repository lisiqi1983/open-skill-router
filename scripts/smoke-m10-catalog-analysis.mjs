import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m10-"));
const localIndexPath = path.join(root, "local-index.json");
const localAnalysisPath = path.join(root, "local-analysis.json");
const localMarkdownPath = path.join(root, "local-analysis.md");
const staticIndexDir = path.join(root, "public", "open-skill-router", "index");

await mkdir(staticIndexDir, { recursive: true });
await runCli(["index", "examples/mock-skills", "--out", localIndexPath]);

const localAnalysis = JSON.parse(
  await runCli([
    "catalog",
    "analyze",
    "--index",
    localIndexPath,
    "--out",
    localAnalysisPath,
    "--markdown",
    localMarkdownPath,
    "--json",
  ]),
);
assertAnalysis(localAnalysis, {
  label: "local analysis",
  minSkillCount: 3,
  expectedSourceRoot: path.join(repoRoot, "examples", "mock-skills"),
});

const persistedAnalysis = JSON.parse(await readFile(localAnalysisPath, "utf8"));
assertAnalysis(persistedAnalysis, {
  label: "persisted local analysis",
  minSkillCount: 3,
  expectedSourceRoot: path.join(repoRoot, "examples", "mock-skills"),
});

const markdown = await readFile(localMarkdownPath, "utf8");
if (!markdown.includes("# Skill Catalog Analysis")) {
  throw new Error("Markdown report should include the analysis heading.");
}
if (!markdown.includes("domain_by_output")) {
  throw new Error("Markdown report should include tensor slice names.");
}

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
  const remoteAnalysis = JSON.parse(
    await runCli(["catalog", "analyze", "--source", remoteSource, "--json"]),
  );

  assertAnalysis(remoteAnalysis, {
    label: "remote analysis",
    minSkillCount: 4,
    expectedSourceRoot: remoteSource,
  });
  if (
    !remoteAnalysis.skillProfiles.some(
      (profile) => profile.name === "open-skill-router",
    )
  ) {
    throw new Error("Remote analysis should include the router entry skill.");
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke M10 catalog analysis passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertAnalysis(analysis, options) {
  if (analysis.schemaVersion !== "skillrouter.catalog-analysis/v1") {
    throw new Error(`${options.label} has invalid schema.`);
  }
  if (analysis.skillCount < options.minSkillCount) {
    throw new Error(
      `${options.label} expected at least ${options.minSkillCount} skill(s), got ${analysis.skillCount}.`,
    );
  }
  if (analysis.sourceRoot !== options.expectedSourceRoot) {
    throw new Error(
      `${options.label} source root mismatch: ${analysis.sourceRoot}`,
    );
  }
  const dimensions = new Set(
    analysis.dimensions.map((dimension) => dimension.dimension),
  );
  for (const dimension of ["domains", "outputFormats", "riskLevel"]) {
    if (!dimensions.has(dimension)) {
      throw new Error(`${options.label} missing ${dimension} dimension.`);
    }
  }
  if (
    !analysis.matrixSlices.some(
      (slice) => slice.name === "domain_by_output" && slice.cells.length > 0,
    )
  ) {
    throw new Error(`${options.label} missing domain_by_output cells.`);
  }
  if (!Array.isArray(analysis.skillProfiles)) {
    throw new Error(`${options.label} missing skill profiles.`);
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
  if (filePath.endsWith(".md")) return "text/markdown";
  return "text/plain";
}
