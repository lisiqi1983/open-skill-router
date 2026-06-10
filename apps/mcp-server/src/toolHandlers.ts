import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applySafeUpdates,
  checkForUpdates,
  createInstallPlan,
  getLockfilePath,
  getSkillRouterHome,
  installSkill,
  readLockfile,
  type CheckUpdatesOptions,
  type InstallSkillOptions,
} from "@openskillrouter/cache";
import {
  defaultProjectIndexPath,
  discoverLocalSkills,
  readLocalSkillIndex,
  recommendSkills,
  type ModelRerankOutput,
  type RecommendationMode,
} from "@openskillrouter/core";

export interface RecommendSkillsToolInput {
  task: string;
  index_path?: string;
  source_root?: string;
  privacy_mode?: "strict" | "balanced" | "cloud";
  recommendation_mode?: RecommendationMode;
  max_results?: number;
  include_candidate_pack?: boolean;
  model_rerank?: ModelRerankOutput;
}

export interface InspectSkillToolInput {
  locator: string;
  home_dir?: string;
  project_root?: string;
  scope?: "user" | "project";
}

export interface InstallSkillToolInput extends InspectSkillToolInput {
  agent_host?: "generic";
  target_dir?: string;
  allow_high_risk?: boolean;
  pin?: boolean;
}

export interface LoadSkillToolInput {
  skill: string;
  home_dir?: string;
  project_root?: string;
  scope?: "user" | "project";
  max_skill_md_chars?: number;
}

export interface UpdateSkillToolInput {
  action?: "check" | "safe";
  skill?: string;
  home_dir?: string;
  project_root?: string;
  scope?: "user" | "project";
  target_dir?: string;
}

export interface RecordFeedbackToolInput {
  skill_id: string;
  recommendation_id?: string;
  accepted?: boolean;
  task_completed?: boolean;
  rating?: number;
  comment?: string;
  anonymous_tags?: Record<string, unknown>;
  home_dir?: string;
}

export async function recommendSkillsTool(
  input: RecommendSkillsToolInput,
): Promise<Record<string, unknown>> {
  const index = input.source_root
    ? await discoverLocalSkills(input.source_root)
    : await readLocalSkillIndex(input.index_path ?? defaultProjectIndexPath());
  const mode =
    input.include_candidate_pack && !input.recommendation_mode
      ? "full_skill_rerank"
      : (input.recommendation_mode ?? "fast_metadata");

  return recommendSkills({
    index,
    task: input.task,
    maxResults: input.max_results,
    mode,
    privacyMode: input.privacy_mode,
    modelRerank: input.model_rerank,
  }) as unknown as Record<string, unknown>;
}

export async function inspectSkillTool(
  input: InspectSkillToolInput,
): Promise<Record<string, unknown>> {
  const plan = await createInstallPlan(input.locator, {
    homeDir: input.home_dir,
    projectRoot: input.project_root,
    scope: input.scope,
    agentHost: "generic",
  });

  try {
    return {
      skill: plan.skill,
      source: plan.source,
      scan: plan.scan,
      cache_path: plan.cachePath,
      lockfile_path: plan.lockfilePath,
      blocked: plan.blocked,
      warnings: plan.warnings,
    };
  } finally {
    await plan.source.cleanup?.();
  }
}

export async function installSkillTool(
  input: InstallSkillToolInput,
): Promise<Record<string, unknown>> {
  const result = await installSkill(input.locator, toInstallOptions(input));

  return {
    installed_skill: result.installedSkill,
    plan: {
      skill: result.plan.skill,
      source: result.plan.source,
      scan: result.plan.scan,
      cache_path: result.plan.cachePath,
      lockfile_path: result.plan.lockfilePath,
      blocked: result.plan.blocked,
      warnings: result.plan.warnings,
    },
  };
}

export async function loadSkillTool(
  input: LoadSkillToolInput,
): Promise<Record<string, unknown>> {
  const scope = input.scope ?? "user";
  const lockfilePath = getLockfilePath({
    scope,
    homeDir: input.home_dir,
    projectRoot: input.project_root,
  });
  const lockfile = await readLockfile(lockfilePath);
  const installedSkill = lockfile.skills.find(
    (skill) => skill.skillId === input.skill || skill.locator === input.skill,
  );

  if (!installedSkill) {
    throw new Error(`Installed skill not found: ${input.skill}`);
  }

  const skillMdPath = path.join(installedSkill.cachePath, "SKILL.md");
  const skillMd = await fs.readFile(skillMdPath, "utf8");
  const maxChars = input.max_skill_md_chars ?? 12_000;

  return {
    installed_skill: installedSkill,
    lockfile_path: lockfilePath,
    skill_path: installedSkill.cachePath,
    skill_md_path: skillMdPath,
    skill_md:
      skillMd.length > maxChars
        ? `${skillMd.slice(0, maxChars)}\n[truncated]`
        : skillMd,
    truncated: skillMd.length > maxChars,
  };
}

export async function updateSkillTool(
  input: UpdateSkillToolInput,
): Promise<Record<string, unknown>> {
  const options: CheckUpdatesOptions = {
    homeDir: input.home_dir,
    projectRoot: input.project_root,
    scope: input.scope,
    targetDir: input.target_dir,
  };

  if (input.action === "safe") {
    const updated = await applySafeUpdates({
      homeDir: input.home_dir,
      projectRoot: input.project_root,
      scope: input.scope,
      targetDir: input.target_dir,
    });

    return {
      updated: filterInstalledSkills(updated, input.skill),
    };
  }

  const checks = await checkForUpdates(options);

  return {
    checks: input.skill
      ? checks.filter(
          (check) =>
            check.installedSkill.skillId === input.skill ||
            check.installedSkill.locator === input.skill,
        )
      : checks,
  };
}

export async function recordFeedbackTool(
  input: RecordFeedbackToolInput,
): Promise<Record<string, unknown>> {
  const homeDir = getSkillRouterHome(input.home_dir);
  const feedbackDir = path.join(homeDir, "feedback");
  const feedbackPath = path.join(feedbackDir, "feedback.jsonl");
  const record = {
    schema_version: "skillrouter.feedback/v1",
    recorded_at: new Date().toISOString(),
    skill_id: input.skill_id,
    recommendation_id: input.recommendation_id,
    accepted: input.accepted,
    task_completed: input.task_completed,
    rating: input.rating,
    comment: input.comment,
    anonymous_tags: input.anonymous_tags,
  };

  await fs.mkdir(feedbackDir, { recursive: true });
  await fs.appendFile(feedbackPath, `${JSON.stringify(record)}\n`, "utf8");

  return {
    feedback_path: feedbackPath,
    recorded: record,
  };
}

function toInstallOptions(input: InstallSkillToolInput): InstallSkillOptions {
  return {
    homeDir: input.home_dir,
    projectRoot: input.project_root,
    scope: input.scope,
    targetDir: input.target_dir,
    agentHost: input.agent_host ?? "generic",
    allowHighRisk: input.allow_high_risk,
    pinned: input.pin,
  };
}

function filterInstalledSkills<T extends { skillId: string; locator: string }>(
  skills: T[],
  skill?: string,
): T[] {
  if (!skill) return skills;
  return skills.filter(
    (installedSkill) =>
      installedSkill.skillId === skill || installedSkill.locator === skill,
  );
}
