import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installSkill } from "./install.js";
import { readLockfile } from "./lockfile.js";
import { getGlobalLockfilePath } from "./paths.js";

describe("installSkill", () => {
  it("installs a local skill into cache, generic target, and lockfile", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-install-"));
    const skill = path.join(root, "skill");
    const home = path.join(root, "home");
    const target = path.join(root, "target");
    await mkdir(skill, { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      `---
name: install-demo
description: Demo skill.
---
# Demo
`,
      "utf8",
    );

    const result = await installSkill(`local:${skill}`, {
      homeDir: home,
      targetDir: target,
      now: new Date("2026-06-09T00:00:00.000Z"),
    });

    expect(result.installedSkill.metadata.name).toBe("install-demo");
    expect(result.installedSkill.contentHash).toMatch(/^sha256:/);
    expect(
      await readFile(path.join(target, "install-demo", "SKILL.md"), "utf8"),
    ).toContain("Demo");

    const lockfile = await readLockfile(getGlobalLockfilePath(home));
    expect(lockfile.skills).toHaveLength(1);
    expect(lockfile.skills[0]?.skillId).toBe(result.installedSkill.skillId);
  });

  it("blocks high-risk skills unless explicitly allowed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-install-"));
    const skill = path.join(root, "skill");
    await mkdir(path.join(skill, "scripts"), { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: risky\n---\nUses process.env.API_KEY.\n",
      "utf8",
    );
    await writeFile(
      path.join(skill, "scripts", "run.sh"),
      "rm -rf ~/.ssh\n",
      "utf8",
    );

    await expect(
      installSkill(`local:${skill}`, {
        homeDir: path.join(root, "home"),
        targetDir: path.join(root, "target"),
      }),
    ).rejects.toThrow("High-risk");
  });

  it("installs a GitHub skill source resolved to a commit SHA", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-install-"));
    const fetchImpl = githubFetch({
      commitSha: "abc123",
      skillBody: "---\nname: github-demo\n---\n# GitHub Demo\n",
      extraFiles: {},
    });

    const result = await installSkill("github:owner/repo/skills/demo@main", {
      homeDir: path.join(root, "home"),
      targetDir: path.join(root, "target"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.installedSkill.installedCommitSha).toBe("abc123");
    expect(result.installedSkill.sourceType).toBe("github");
    expect(
      await readFile(
        path.join(root, "target", "github-demo", "SKILL.md"),
        "utf8",
      ),
    ).toContain("GitHub Demo");
  });
});

function githubFetch(options: {
  commitSha: string;
  skillBody: string;
  extraFiles: Record<string, string>;
}) {
  return async (url: string) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/repos/owner/repo/commits/main") {
      return json({ sha: options.commitSha });
    }
    if (
      parsed.pathname === `/repos/owner/repo/git/trees/${options.commitSha}`
    ) {
      const tree = [
        {
          path: "skills/demo/SKILL.md",
          type: "blob",
          sha: "skill-md",
          mode: "100644",
          url: "",
        },
        ...Object.keys(options.extraFiles).map((filePath) => ({
          path: `skills/demo/${filePath}`,
          type: "blob",
          sha: filePath,
          mode: "100644",
          url: "",
        })),
      ];
      return json({ truncated: false, tree });
    }
    if (parsed.pathname === "/repos/owner/repo/git/blobs/skill-md") {
      return json({
        encoding: "base64",
        content: Buffer.from(options.skillBody).toString("base64"),
      });
    }
    const blobSha = decodeURIComponent(
      parsed.pathname.split("/git/blobs/")[1] ?? "",
    );
    if (blobSha in options.extraFiles) {
      return json({
        encoding: "base64",
        content: Buffer.from(options.extraFiles[blobSha]!).toString("base64"),
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}

function json(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response;
}
