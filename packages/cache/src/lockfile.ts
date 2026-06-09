import { promises as fs } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type {
  InstalledSkill,
  SkillRouterLockfile,
} from "@openskillrouter/skill-spec";

export function emptyLockfile(now = new Date()): SkillRouterLockfile {
  return {
    schemaVersion: "skillrouter.lock/v1",
    updatedAt: now.toISOString(),
    skills: [],
  };
}

export async function readLockfile(
  lockfilePath: string,
): Promise<SkillRouterLockfile> {
  try {
    const content = await fs.readFile(lockfilePath, "utf8");
    const parsed = parse(content) as SkillRouterLockfile;
    if (
      parsed?.schemaVersion !== "skillrouter.lock/v1" ||
      !Array.isArray(parsed.skills)
    ) {
      throw new Error(`Unsupported lockfile schema: ${lockfilePath}`);
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return emptyLockfile();
    }
    throw error;
  }
}

export async function writeLockfile(
  lockfilePath: string,
  lockfile: SkillRouterLockfile,
): Promise<void> {
  await fs.mkdir(path.dirname(lockfilePath), { recursive: true });
  await fs.writeFile(lockfilePath, stringify(lockfile), "utf8");
}

export async function upsertInstalledSkill(
  lockfilePath: string,
  installedSkill: InstalledSkill,
  now = new Date(),
): Promise<SkillRouterLockfile> {
  const lockfile = await readLockfile(lockfilePath);
  const existingIndex = lockfile.skills.findIndex(
    (skill) =>
      skill.skillId === installedSkill.skillId &&
      skill.agentHost === installedSkill.agentHost &&
      skill.scope === installedSkill.scope,
  );

  const nextSkill = {
    ...installedSkill,
    pinned:
      existingIndex >= 0
        ? lockfile.skills[existingIndex]!.pinned || installedSkill.pinned
        : installedSkill.pinned,
  };

  if (existingIndex >= 0) {
    lockfile.skills[existingIndex] = nextSkill;
  } else {
    lockfile.skills.push(nextSkill);
  }

  lockfile.updatedAt = now.toISOString();
  lockfile.skills.sort((left, right) =>
    left.skillId.localeCompare(right.skillId),
  );
  await writeLockfile(lockfilePath, lockfile);
  return lockfile;
}

export async function pinInstalledSkill(
  lockfilePath: string,
  skillIdOrLocator: string,
  pinned: boolean,
  now = new Date(),
): Promise<InstalledSkill> {
  const lockfile = await readLockfile(lockfilePath);
  const skill = lockfile.skills.find(
    (installed) =>
      installed.skillId === skillIdOrLocator ||
      installed.locator === skillIdOrLocator,
  );
  if (!skill) {
    throw new Error(
      `Installed skill not found in lockfile: ${skillIdOrLocator}`,
    );
  }

  skill.pinned = pinned;
  lockfile.updatedAt = now.toISOString();
  await writeLockfile(lockfilePath, lockfile);
  return skill;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
