import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m7-"));
const localIndexPath = path.join(root, "local-index.json");
const localCatalogPath = path.join(root, "local-catalog.json");
const staticIndexDir = path.join(root, "public", "open-skill-router", "index");
const remoteCatalogPath = path.join(root, "remote-catalog.json");

await mkdir(staticIndexDir, { recursive: true });
await runCli(["index", "examples/mock-skills", "--out", localIndexPath]);

const localCatalog = JSON.parse(
  await runCli([
    "catalog",
    "build",
    "--index",
    localIndexPath,
    "--out",
    localCatalogPath,
    "--json",
  ]),
);
assertCatalog(localCatalog, {
  label: "local catalog",
  minSkillCount: 3,
  expectedSourceRoot: path.join(repoRoot, "examples", "mock-skills"),
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
  const remoteCatalog = JSON.parse(
    await runCli([
      "catalog",
      "build",
      "--source",
      remoteSource,
      "--out",
      remoteCatalogPath,
      "--json",
    ]),
  );

  assertCatalog(remoteCatalog, {
    label: "remote catalog",
    minSkillCount: 4,
    expectedSourceRoot: remoteSource,
  });
  if (!remoteCatalog.summary.domains.some((item) => item.value === "router")) {
    throw new Error("Remote catalog should include the router entry skill.");
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke M7 catalog passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertCatalog(catalog, options) {
  if (catalog.schemaVersion !== "skillrouter.catalog/v1") {
    throw new Error(`${options.label} has invalid schema.`);
  }
  if (catalog.skillCount < options.minSkillCount) {
    throw new Error(
      `${options.label} expected at least ${options.minSkillCount} skill(s), got ${catalog.skillCount}.`,
    );
  }
  if (catalog.sourceRoot !== options.expectedSourceRoot) {
    throw new Error(
      `${options.label} source root mismatch: ${catalog.sourceRoot}`,
    );
  }
  for (const section of ["domains", "intents", "environments", "riskLevels"]) {
    if (!Array.isArray(catalog.summary[section])) {
      throw new Error(`${options.label} missing summary.${section}.`);
    }
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
