import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSkillRouterApiServer } from "../apps/api/dist/index.js";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const root = await mkdtemp(path.join(tmpdir(), "skillrouter-m5-"));
const manifestPath = path.join(root, "skillrouter.source.yaml");
const outDir = path.join(root, "public-index");
const feedbackDir = path.join(root, "feedback");
const mockSkillsPath = path
  .join(repoRoot, "examples", "mock-skills")
  .replace(/\\/g, "/");

await writeFile(
  manifestPath,
  `schema_version: "skillrouter.source/v1"
name: "api-smoke-index"
sources:
  - type: local
    path: "${mockSkillsPath}"
`,
  "utf8",
);

await runCli(["index-source", manifestPath, "--out", outDir]);

const server = createSkillRouterApiServer({
  defaultSource: outDir,
  feedbackDir,
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected API server to listen on a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetchJson(`${baseUrl}/health`);
  if (health.status !== "ok") {
    throw new Error(
      `Unexpected API health response: ${JSON.stringify(health)}`,
    );
  }

  const direct = await postJson(`${baseUrl}/v1/recommend`, {
    task: "帮我生成一份产品发布 PPT",
    max_results: 3,
  });
  assertPresentationDeck(direct, "direct API recommend");

  const viaCli = JSON.parse(
    await runCli([
      "recommend",
      "帮我生成一份产品发布 PPT",
      "--api",
      baseUrl,
      "--json",
    ]),
  );
  assertPresentationDeck(viaCli, "CLI API recommend");

  const feedback = await postJson(`${baseUrl}/v1/feedback`, {
    skill_id: "local:presentation-deck",
    accepted: true,
    rating: 5,
    task_text: "must not be stored",
  });
  const feedbackJsonl = await readFile(feedback.feedbackPath, "utf8");
  if (!feedbackJsonl.includes("local:presentation-deck")) {
    throw new Error("Feedback JSONL did not include skill id.");
  }
  if (feedbackJsonl.includes("must not be stored")) {
    throw new Error("Feedback JSONL stored task text.");
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke M5 API passed.");

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
  });
  return stdout;
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `API request failed ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function assertPresentationDeck(result, label) {
  const first = result.recommendations?.[0]?.skill?.name;
  if (first !== "presentation-deck") {
    throw new Error(`Expected presentation-deck from ${label}, got ${first}.`);
  }
}
