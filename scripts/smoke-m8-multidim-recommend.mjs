import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m8-"));
const localIndexPath = path.join(root, "local-index.json");
const staticIndexDir = path.join(root, "public", "open-skill-router", "index");
const task =
  "请审查 GitHub PR 中的 TypeScript 代码变更，找 bug 和缺测试，输出 markdown";

await mkdir(staticIndexDir, { recursive: true });
await runCli(["index", "examples/mock-skills", "--out", localIndexPath]);

const localRecommendation = JSON.parse(
  await runCli(["recommend", task, "--index", localIndexPath, "--json"]),
);
assertCodeReviewRecommendation(localRecommendation, "local index");

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
  const remoteRecommendation = JSON.parse(
    await runCli(["recommend", task, "--source", remoteSource, "--json"]),
  );
  assertCodeReviewRecommendation(remoteRecommendation, "remote static source");
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke M8 multidimensional recommendation passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertCodeReviewRecommendation(result, label) {
  const first = result.recommendations?.[0];
  if (first?.skill?.name !== "code-review") {
    throw new Error(
      `Expected code-review first from ${label}, got ${first?.skill?.name}.`,
    );
  }
  const breakdown = first.scoreBreakdown ?? {};
  for (const key of [
    "catalogIntentFit",
    "domainFit",
    "environmentFit",
    "workflowFit",
  ]) {
    if (typeof breakdown[key] !== "number") {
      throw new Error(`${label} missing scoreBreakdown.${key}.`);
    }
  }
  if (breakdown.catalogIntentFit < 80 || breakdown.domainFit < 80) {
    throw new Error(
      `${label} should have strong catalog intent/domain fit: ${JSON.stringify(breakdown)}`,
    );
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
      response.writeHead(200, { "content-type": contentType(statPath) });
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
