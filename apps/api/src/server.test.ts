import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildSkillSearchIndex,
  discoverLocalSkills,
  writeSkillSearchIndex,
  writeStaticSkillIndex,
} from "@openskillrouter/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSkillRouterApiServer } from "./server.js";

describe("Open Skill Router API", () => {
  let server: ReturnType<typeof createSkillRouterApiServer> | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-api-"));
    const source = path.join(root, "index");
    const searchIndexPath = path.join(root, "search-index.json");
    const feedbackDir = path.join(root, "feedback");
    const index = await discoverLocalSkills("../../examples/mock-skills", {
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    await writeStaticSkillIndex(index, source, {
      name: "api-test",
      now: new Date("2026-06-10T00:00:00.000Z"),
    });
    await writeSkillSearchIndex(buildSkillSearchIndex(index), searchIndexPath);

    server = createSkillRouterApiServer({
      defaultSource: source,
      searchIndexPath,
      feedbackDir,
      now: () => new Date("2026-06-10T00:00:00.000Z"),
    });
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected an ephemeral API port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  });

  it("serves health and recommendations", async () => {
    await expect(fetchJson(`${baseUrl}/health`)).resolves.toEqual(
      expect.objectContaining({
        status: "ok",
      }),
    );

    const result = await postJson(`${baseUrl}/v1/recommend`, {
      task: "帮我生成一份产品发布 PPT",
      max_results: 3,
    });

    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill: expect.objectContaining({ name: "presentation-deck" }),
        }),
      ]),
    );
  });

  it("can recommend through the search prefilter", async () => {
    const result = await postJson(`${baseUrl}/v1/recommend`, {
      task: "review TypeScript code for bugs",
      max_results: 2,
      search_prefilter: true,
      search_max_results: 3,
    });

    expect(result.searchPrefilter).toEqual(
      expect.objectContaining({
        schemaVersion: "skillrouter.search/v1",
        results: expect.any(Array),
      }),
    );
    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill: expect.objectContaining({ name: "code-review" }),
        }),
      ]),
    );
  });

  it("rejects strict local API recommendation mode", async () => {
    const response = await fetch(`${baseUrl}/v1/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "帮我生成一份产品发布 PPT",
        recommendation_mode: "strict_local",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining("strict_local"),
        }),
      }),
    );
  });

  it("rejects client-selected server index paths", async () => {
    const response = await fetch(`${baseUrl}/v1/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "帮我生成一份产品发布 PPT",
        index_path: "C:/Users/example/private-index.json",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining("index_path"),
        }),
      }),
    );
  });

  it("records feedback without task text", async () => {
    const result = await postJson(`${baseUrl}/v1/feedback`, {
      skill_id: "local:presentation-deck",
      accepted: true,
      task_completed: true,
      rating: 5,
      anonymous_tags: {
        scenario: "presentation",
      },
      task_text: "this should not be stored",
    });

    expect(result.recorded).toBe(true);
    const feedback = await readFile(result.feedbackPath as string, "utf8");
    expect(feedback).toContain("local:presentation-deck");
    expect(feedback).not.toContain("this should not be stored");
  });
});

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  return (await response.json()) as Record<string, unknown>;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Record<string, unknown>;
}
