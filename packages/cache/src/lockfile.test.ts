import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  pinInstalledSkill,
  readLockfile,
  upsertInstalledSkill,
} from "./lockfile.js";

describe("lockfile", () => {
  it("upserts and pins installed skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-lock-"));
    const lockfilePath = path.join(root, "global.skillrouter.lock");

    await upsertInstalledSkill(
      lockfilePath,
      {
        skillId: "local:demo",
        locator: "local:/demo",
        sourceType: "local",
        sourceUrl: "/demo",
        installedAt: "2026-06-09T00:00:00.000Z",
        installedCommitSha: "local-1",
        contentHash: "sha256:abc",
        installPath: "/agent/demo",
        cachePath: "/cache/demo",
        agentHost: "generic",
        scope: "user",
        pinned: false,
        allowedPermissions: {
          filesystem: "none",
          network: { access: "none" },
          runtime: { python: "none", node: "none", shell: "none" },
          secrets: "none",
        },
        riskLevel: "low",
        fileCount: 1,
        scriptCount: 0,
        metadata: {
          name: "demo",
          description: "Demo",
        },
      },
      new Date("2026-06-09T00:00:00.000Z"),
    );

    await pinInstalledSkill(lockfilePath, "local:demo", true);
    const lockfile = await readLockfile(lockfilePath);

    expect(lockfile.skills[0]?.pinned).toBe(true);
  });
});
