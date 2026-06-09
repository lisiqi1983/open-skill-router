import {
  diffPermissions,
  scanSkillDirectory,
  type UpdateClassification,
} from "@openskillrouter/security";
import type { InstalledSkill } from "@openskillrouter/skill-spec";
import { fetchSkillSource } from "@openskillrouter/adapters";
import path from "node:path";
import { installSkill, type InstallSkillOptions } from "./install.js";
import { readLockfile } from "./lockfile.js";
import { getLockfilePath } from "./paths.js";

export interface CheckUpdatesOptions {
  homeDir?: string;
  projectRoot?: string;
  scope?: "user" | "project";
  targetDir?: string;
  fetchImpl?: typeof fetch;
}

export interface SkillUpdateCheck {
  installedSkill: InstalledSkill;
  classification: UpdateClassification;
  reasons: string[];
  latestCommitSha?: string;
  latestContentHash?: string;
}

export async function checkForUpdates(
  options: CheckUpdatesOptions = {},
): Promise<SkillUpdateCheck[]> {
  const scope = options.scope ?? "user";
  const lockfilePath = getLockfilePath({
    scope,
    homeDir: options.homeDir,
    projectRoot: options.projectRoot,
  });
  const lockfile = await readLockfile(lockfilePath);
  const checks: SkillUpdateCheck[] = [];

  for (const installedSkill of lockfile.skills) {
    if (installedSkill.scope !== scope) continue;
    if (installedSkill.pinned) {
      checks.push({
        installedSkill,
        classification: "blocked",
        reasons: ["Skill is pinned; update is blocked until unpinned."],
      });
      continue;
    }

    const fetched = await fetchSkillSource(installedSkill.locator, {
      fetchImpl: options.fetchImpl,
    });
    try {
      const scan = await scanSkillDirectory(fetched.rootPath);
      if (
        scan.contentHash === installedSkill.contentHash &&
        fetched.commitSha === installedSkill.installedCommitSha
      ) {
        checks.push({
          installedSkill,
          classification: "no_update",
          reasons: ["Installed skill already matches the source."],
          latestCommitSha: fetched.commitSha,
          latestContentHash: scan.contentHash,
        });
        continue;
      }

      const diff = diffPermissions(
        {
          permissions: installedSkill.allowedPermissions,
          riskLevel: installedSkill.riskLevel,
          scriptCount: installedSkill.scriptCount,
          sourceUrl: installedSkill.sourceUrl,
        },
        {
          permissions: scan.permissions,
          riskLevel: scan.riskLevel,
          scriptCount: scan.scriptFindings.length,
          sourceUrl: fetched.sourceUrl,
        },
      );

      checks.push({
        installedSkill,
        classification: diff.classification,
        reasons: diff.reasons,
        latestCommitSha: fetched.commitSha,
        latestContentHash: scan.contentHash,
      });
    } finally {
      await fetched.cleanup?.();
    }
  }

  return checks;
}

export async function applySafeUpdates(
  options: InstallSkillOptions = {},
): Promise<InstalledSkill[]> {
  const checks = await checkForUpdates(options);
  const updated: InstalledSkill[] = [];

  for (const check of checks) {
    if (check.classification !== "safe") continue;
    const result = await installSkill(check.installedSkill.locator, {
      ...options,
      scope: check.installedSkill.scope,
      agentHost: "generic",
      pinned: check.installedSkill.pinned,
      targetDir:
        options.targetDir ?? path.dirname(check.installedSkill.installPath),
    });
    updated.push(result.installedSkill);
  }

  return updated;
}
