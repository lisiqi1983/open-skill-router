import { promises as fs } from "node:fs";
import path from "node:path";
import {
  fetchSkillSource,
  installGenericAgentSkill,
  type FetchedSkillSource,
  type FetchSkillSourceOptions,
} from "@openskillrouter/adapters";
import {
  scanSkillDirectory,
  type SkillDirectoryScan,
} from "@openskillrouter/security";
import {
  parseSkillMd,
  type InstalledSkill,
  type SkillReference,
} from "@openskillrouter/skill-spec";
import { copyDirectory } from "@openskillrouter/adapters";
import { getCachedSkillPath } from "./cacheLayout.js";
import { upsertInstalledSkill } from "./lockfile.js";
import { getLockfilePath, getSkillRouterHome } from "./paths.js";

export interface InstallSkillOptions extends FetchSkillSourceOptions {
  homeDir?: string;
  projectRoot?: string;
  agentHost?: "generic";
  scope?: "user" | "project";
  targetDir?: string;
  allowHighRisk?: boolean;
  pinned?: boolean;
  now?: Date;
}

export interface InstallPlan {
  source: FetchedSkillSource;
  skill: SkillReference;
  scan: SkillDirectoryScan;
  cachePath: string;
  lockfilePath: string;
  agentHost: "generic";
  scope: "user" | "project";
  targetDir?: string;
  blocked: boolean;
  warnings: string[];
}

export interface InstallResult {
  plan: InstallPlan;
  installedSkill: InstalledSkill;
}

export async function inspectSkill(
  locator: string,
  options: FetchSkillSourceOptions = {},
): Promise<InstallPlan> {
  const source = await fetchSkillSource(locator, options);
  try {
    return await buildInstallPlanFromSource(source, {
      agentHost: "generic",
      scope: "user",
      homeDir: options.tmpRoot,
    });
  } finally {
    await source.cleanup?.();
  }
}

export async function createInstallPlan(
  locator: string,
  options: InstallSkillOptions = {},
): Promise<InstallPlan> {
  const source = await fetchSkillSource(locator, options);
  return buildInstallPlanFromSource(source, options);
}

export async function installSkill(
  locator: string,
  options: InstallSkillOptions = {},
): Promise<InstallResult> {
  const plan = await createInstallPlan(locator, options);
  try {
    if (plan.blocked) {
      throw new Error(`Install blocked: ${plan.warnings.join(" ")}`);
    }

    await fs.mkdir(path.dirname(plan.cachePath), { recursive: true });
    await copyDirectory(plan.source.rootPath, plan.cachePath);
    await writeMeta(plan);

    const hostResult = await installGenericAgentSkill({
      skillCachePath: plan.cachePath,
      skillName: plan.skill.name,
      scope: plan.scope,
      projectRoot: options.projectRoot,
      targetDir: options.targetDir,
      homeDir: getSkillRouterHome(options.homeDir),
    });
    const now = options.now ?? new Date();
    const installedSkill: InstalledSkill = {
      skillId: plan.skill.id,
      locator: plan.source.locator,
      sourceType: plan.source.sourceType,
      sourceUrl: plan.source.sourceUrl,
      installedAt: now.toISOString(),
      installedRef: plan.source.ref,
      installedCommitSha: plan.source.commitSha,
      contentHash: plan.scan.contentHash,
      installPath: hostResult.installPath,
      cachePath: plan.cachePath,
      agentHost: hostResult.agentHost,
      scope: plan.scope,
      pinned: options.pinned ?? false,
      allowedPermissions: plan.scan.permissions,
      riskLevel: plan.scan.riskLevel,
      fileCount: plan.scan.files.length,
      scriptCount: plan.scan.scriptFindings.length,
      metadata: {
        name: plan.skill.name,
        displayName: plan.skill.displayName,
        description: plan.skill.description,
      },
    };

    await upsertInstalledSkill(plan.lockfilePath, installedSkill, now);
    return {
      plan,
      installedSkill,
    };
  } finally {
    await plan.source.cleanup?.();
  }
}

async function buildInstallPlanFromSource(
  source: FetchedSkillSource,
  options: InstallSkillOptions,
): Promise<InstallPlan> {
  const skillMd = await fs.readFile(
    path.join(source.rootPath, "SKILL.md"),
    "utf8",
  );
  const parsed = parseSkillMd(skillMd, {
    fallbackName: path.basename(source.rootPath),
  });
  const scan = await scanSkillDirectory(source.rootPath);
  const now = (options.now ?? new Date()).toISOString();
  const skill: SkillReference = {
    id: source.id,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
    locator: source.locator,
    repo: source.repo,
    path: source.path,
    ref: source.ref,
    commitSha: source.commitSha,
    name: parsed.name,
    displayName: parsed.displayName,
    description: parsed.description,
    tags: parsed.tags,
    capabilities: parsed.capabilities,
    intents: parsed.intents,
    inputFormats: parsed.inputFormats,
    outputFormats: parsed.outputFormats,
    languages: parsed.languages,
    permissions: scan.permissions,
    riskLevel: scan.riskLevel,
    compatibility: {
      genericAgentSkills: true,
    },
    indexedAt: now,
    contentHash: scan.contentHash,
    metadataHash:
      scan.files.find((file) => file.path === "SKILL.md")?.sha256 ??
      scan.contentHash,
    qualitySignals: {},
  };
  const agentHost = options.agentHost ?? "generic";
  const scope = options.scope ?? "user";
  const warnings =
    scan.riskLevel === "high" && !options.allowHighRisk
      ? ["High-risk skill requires explicit --allow-high-risk."]
      : [];

  return {
    source,
    skill,
    scan,
    cachePath: getCachedSkillPath(source, options.homeDir),
    lockfilePath: getLockfilePath({
      scope,
      homeDir: options.homeDir,
      projectRoot: options.projectRoot,
    }),
    agentHost,
    scope,
    targetDir: options.targetDir,
    blocked: warnings.length > 0,
    warnings,
  };
}

async function writeMeta(plan: InstallPlan): Promise<void> {
  const meta = {
    schemaVersion: "skillrouter.cache-meta/v1",
    source: {
      locator: plan.source.locator,
      sourceType: plan.source.sourceType,
      sourceUrl: plan.source.sourceUrl,
      commitSha: plan.source.commitSha,
      ref: plan.source.ref,
    },
    skill: plan.skill,
    scan: {
      contentHash: plan.scan.contentHash,
      riskLevel: plan.scan.riskLevel,
      permissions: plan.scan.permissions,
      files: plan.scan.files,
      scriptFindings: plan.scan.scriptFindings,
      reasons: plan.scan.reasons,
    },
  };
  await fs.writeFile(
    path.join(plan.cachePath, "skillrouter.meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );
}
