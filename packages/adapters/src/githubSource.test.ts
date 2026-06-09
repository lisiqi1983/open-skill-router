import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fetchGitHubSkillSource } from "./githubSource.js";

describe("fetchGitHubSkillSource", () => {
  it("fetches a skill folder through GitHub API tree and blob responses", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "skillrouter-gh-"));
    const fetchImpl = async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/repos/owner/repo/commits/main") {
        return json({ sha: "abc123" });
      }
      if (parsed.pathname === "/repos/owner/repo/git/trees/abc123") {
        return json({
          truncated: false,
          tree: [
            {
              path: "skills/demo/SKILL.md",
              type: "blob",
              sha: "skill-md",
              mode: "100644",
              url: "",
            },
            {
              path: "skills/demo/references/policy.md",
              type: "blob",
              sha: "policy",
              mode: "100644",
              url: "",
            },
            {
              path: "other/SKILL.md",
              type: "blob",
              sha: "other",
              mode: "100644",
              url: "",
            },
          ],
        });
      }
      if (parsed.pathname === "/repos/owner/repo/git/blobs/skill-md") {
        return json({
          encoding: "base64",
          content: Buffer.from("---\nname: demo\n---\n# Demo\n").toString(
            "base64",
          ),
        });
      }
      if (parsed.pathname === "/repos/owner/repo/git/blobs/policy") {
        return json({
          encoding: "base64",
          content: Buffer.from("Policy\n").toString("base64"),
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const fetched = await fetchGitHubSkillSource(
      "github:owner/repo/skills/demo@main",
      {
        tmpRoot,
        fetchImpl: fetchImpl as typeof fetch,
      },
    );

    expect(fetched.commitSha).toBe("abc123");
    expect(
      await fs.readFile(path.join(fetched.rootPath, "SKILL.md"), "utf8"),
    ).toContain("name: demo");
    expect(
      await fs.readFile(
        path.join(fetched.rootPath, "references", "policy.md"),
        "utf8",
      ),
    ).toBe("Policy\n");
    await fetched.cleanup?.();
  });
});

function json(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response;
}
