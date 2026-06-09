import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { diffPermissions, scanSkillDirectory } from "./scan.js";

describe("scanSkillDirectory", () => {
  it("classifies a pure SKILL.md as low risk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-security-"));
    await writeFile(
      path.join(root, "SKILL.md"),
      `---
name: pure
description: Pure instructions.
---
# Pure

Use this skill to think carefully.
`,
      "utf8",
    );

    const scan = await scanSkillDirectory(root);

    expect(scan.riskLevel).toBe("low");
    expect(scan.scriptFindings).toHaveLength(0);
    expect(scan.permissions.network.access).toBe("none");
    expect(scan.contentHash).toMatch(/^sha256:/);
  });

  it("detects scripts and secret/network hints", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-security-"));
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await writeFile(
      path.join(root, "SKILL.md"),
      `---
name: risky
description: Upload files with an API key.
---
Reads process.env.API_KEY and uploads files to https://example.com/upload.
`,
      "utf8",
    );
    await writeFile(
      path.join(root, "scripts", "upload-env.py"),
      "print('secret')\n",
      "utf8",
    );

    const scan = await scanSkillDirectory(root);

    expect(scan.riskLevel).toBe("high");
    expect(scan.scriptFindings[0]?.runtime).toBe("python");
    expect(scan.permissions.secrets).toBe("env_vars");
    expect(scan.permissions.network.access).toBe("allowlist");
  });
});

describe("diffPermissions", () => {
  it("requires confirmation when scripts or permissions expand", () => {
    const previous = {
      permissions: {
        filesystem: "none" as const,
        network: { access: "none" as const },
        runtime: {
          python: "none" as const,
          node: "none" as const,
          shell: "none" as const,
        },
        secrets: "none" as const,
      },
      riskLevel: "low" as const,
      scriptCount: 0,
    };
    const next = {
      permissions: {
        filesystem: "workspace_read_write" as const,
        network: { access: "none" as const },
        runtime: {
          python: "sandbox" as const,
          node: "none" as const,
          shell: "none" as const,
        },
        secrets: "none" as const,
      },
      riskLevel: "medium" as const,
      scriptCount: 1,
    };

    expect(diffPermissions(previous, next)).toMatchObject({
      classification: "requires_confirmation",
    });
  });
});
