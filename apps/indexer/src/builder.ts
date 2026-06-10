import { promises as fs } from "node:fs";
import path from "node:path";
import { createInstallPlan } from "@openskillrouter/cache";
import {
  discoverLocalSkills,
  readSourceManifest,
  writeStaticSkillIndex,
  type IndexedSkill,
  type LocalSkillIndex,
  type SourceManifest,
  type SourceManifestSkill,
  type SourceManifestSource,
  type WriteStaticSkillIndexResult,
} from "@openskillrouter/core";

export interface BuildStaticIndexOptions {
  outDir: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface BuildStaticIndexResult extends WriteStaticSkillIndexResult {
  index: LocalSkillIndex;
  manifest: WriteStaticSkillIndexResult["manifest"];
}

export async function buildStaticIndexFromManifest(
  manifestPath: string,
  options: BuildStaticIndexOptions,
): Promise<BuildStaticIndexResult> {
  const manifest = await readSourceManifest(manifestPath);
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const indexedAt = (options.now ?? new Date()).toISOString();
  const skills = await collectManifestSkills(manifest, manifestDir, {
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  const index: LocalSkillIndex = {
    schemaVersion: "skillrouter.local-index/v1",
    generatedAt: indexedAt,
    sourceRoot: path.resolve(manifestPath),
    skills: dedupeSkills(skills),
  };
  const written = await writeStaticSkillIndex(index, options.outDir, {
    name: manifest.name,
    description: manifest.description,
    sourceManifest: path.resolve(manifestPath),
    now: options.now,
  });

  return {
    ...written,
    index,
  };
}

async function collectManifestSkills(
  manifest: SourceManifest,
  manifestDir: string,
  options: { now?: Date; fetchImpl?: typeof fetch },
): Promise<IndexedSkill[]> {
  const groups = await Promise.all([
    ...((manifest.sources ?? []).map((source) =>
      collectManifestSource(source, manifestDir, options),
    ) ?? []),
    ...((manifest.skills ?? []).map((skill) =>
      collectManifestSkill(skill, manifestDir, options),
    ) ?? []),
  ]);
  return groups.flat();
}

async function collectManifestSource(
  source: SourceManifestSource,
  manifestDir: string,
  options: { now?: Date },
): Promise<IndexedSkill[]> {
  if (source.type === "local") {
    const sourceRoot = resolveManifestPath(manifestDir, source.path);
    const index = await discoverLocalSkills(sourceRoot, { now: options.now });
    return index.skills.map((skill) =>
      applyCuration(skill, {
        tags: source.tags,
        notes: source.notes,
      }),
    );
  }

  throw new Error(
    "GitHub source-wide include indexing is not implemented yet; list explicit github skills under skills[].",
  );
}

async function collectManifestSkill(
  skill: SourceManifestSkill,
  manifestDir: string,
  options: { now?: Date; fetchImpl?: typeof fetch },
): Promise<IndexedSkill[]> {
  const locator = skillLocator(skill, manifestDir);
  const plan = await createInstallPlan(locator, {
    now: options.now,
    fetchImpl: options.fetchImpl,
  });

  try {
    const body = await fs.readFile(
      path.join(plan.source.rootPath, "SKILL.md"),
      "utf8",
    );
    return [
      applyCuration(
        {
          skill: {
            ...plan.skill,
            id: skill.id ?? plan.skill.id,
          },
          skillFilePath: path.join(plan.source.rootPath, "SKILL.md"),
          rootPath: plan.source.rootPath,
          body,
          indexedAt: plan.skill.indexedAt,
        },
        {
          tags: skill.tags,
          notes: skill.notes,
        },
      ),
    ];
  } finally {
    await plan.source.cleanup?.();
  }
}

function skillLocator(skill: SourceManifestSkill, manifestDir: string): string {
  if (skill.source.type === "local") {
    return `local:${resolveManifestPath(manifestDir, skill.source.path)}`;
  }

  return `github:${skill.source.repo}/${stripSlashes(skill.source.path)}${
    skill.source.ref ? `@${skill.source.ref}` : ""
  }`;
}

function applyCuration(
  indexedSkill: IndexedSkill,
  curation: { tags?: string[]; notes?: string },
): IndexedSkill {
  return {
    ...indexedSkill,
    skill: {
      ...indexedSkill.skill,
      tags: uniqueStrings([
        ...indexedSkill.skill.tags,
        ...(curation.tags ?? []),
      ]),
      readmeSummary: curation.notes ?? indexedSkill.skill.readmeSummary,
    },
  };
}

function dedupeSkills(skills: IndexedSkill[]): IndexedSkill[] {
  const byId = new Map<string, IndexedSkill>();
  for (const skill of skills) {
    byId.set(skill.skill.id, skill);
  }
  return Array.from(byId.values()).sort((left, right) =>
    left.skill.id.localeCompare(right.skill.id),
  );
}

function resolveManifestPath(manifestDir: string, value: string): string {
  return path.resolve(manifestDir, value);
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
