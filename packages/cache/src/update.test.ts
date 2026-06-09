import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installSkill } from "./install.js";
import { applySafeUpdates, checkForUpdates } from "./update.js";

describe("checkForUpdates", () => {
  it("detects safe local documentation updates", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-update-"));
    const skill = path.join(root, "skill");
    const home = path.join(root, "home");
    await mkdir(skill, { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: update-demo\n---\n# Demo\n",
      "utf8",
    );

    await installSkill(`local:${skill}`, {
      homeDir: home,
      targetDir: path.join(root, "target"),
    });

    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: update-demo\n---\n# Demo\n\nMore docs.\n",
      "utf8",
    );

    const checks = await checkForUpdates({
      homeDir: home,
    });

    expect(checks[0]?.classification).toBe("safe");
  });

  it("requires confirmation when an update adds scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-update-"));
    const skill = path.join(root, "skill");
    const home = path.join(root, "home");
    await mkdir(skill, { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: update-risk\n---\n# Demo\n",
      "utf8",
    );

    await installSkill(`local:${skill}`, {
      homeDir: home,
      targetDir: path.join(root, "target"),
    });

    await mkdir(path.join(skill, "scripts"), { recursive: true });
    await writeFile(
      path.join(skill, "scripts", "run.py"),
      "print('new script')\n",
      "utf8",
    );

    const checks = await checkForUpdates({
      homeDir: home,
    });

    expect(checks[0]?.classification).toBe("requires_confirmation");
    expect(checks[0]?.reasons.join(" ")).toContain("script");
  });

  it("applies safe updates to the original install target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-update-"));
    const skill = path.join(root, "skill");
    const home = path.join(root, "home");
    const target = path.join(root, "target");
    await mkdir(skill, { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: safe-apply\n---\n# Demo\n",
      "utf8",
    );

    await installSkill(`local:${skill}`, {
      homeDir: home,
      targetDir: target,
    });

    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: safe-apply\n---\n# Demo\n\nMore docs.\n",
      "utf8",
    );
    const updated = await applySafeUpdates({
      homeDir: home,
    });

    expect(updated).toHaveLength(1);
    expect(
      await readFile(path.join(target, "safe-apply", "SKILL.md"), "utf8"),
    ).toContain("More docs.");
  });

  it("detects GitHub updates that add scripts as confirmation-required", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-update-"));
    await installSkill("github:owner/repo/skills/demo@main", {
      homeDir: path.join(root, "home"),
      targetDir: path.join(root, "target"),
      fetchImpl: githubFetch({
        commitSha: "old123",
        skillBody: "---\nname: github-update\n---\n# Demo\n",
        extraFiles: {},
      }) as typeof fetch,
    });

    const checks = await checkForUpdates({
      homeDir: path.join(root, "home"),
      fetchImpl: githubFetch({
        commitSha: "new456",
        skillBody: "---\nname: github-update\n---\n# Demo\n",
        extraFiles: {
          "scripts/run.py": "print('new')\n",
        },
      }) as typeof fetch,
    });

    expect(checks[0]?.classification).toBe("requires_confirmation");
    expect(checks[0]?.latestCommitSha).toBe("new456");
  });

  it("blocks GitHub hash anomalies when content changes without commit change", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-update-"));
    await installSkill("github:owner/repo/skills/demo@main", {
      homeDir: path.join(root, "home"),
      targetDir: path.join(root, "target"),
      fetchImpl: githubFetch({
        commitSha: "same123",
        skillBody: "---\nname: github-hash\n---\n# Demo\n",
        extraFiles: {},
      }) as typeof fetch,
    });

    const checks = await checkForUpdates({
      homeDir: path.join(root, "home"),
      fetchImpl: githubFetch({
        commitSha: "same123",
        skillBody: "---\nname: github-hash\n---\n# Tampered\n",
        extraFiles: {},
      }) as typeof fetch,
    });

    expect(checks[0]?.classification).toBe("blocked");
    expect(checks[0]?.reasons.join(" ")).toContain("commit SHA");
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
