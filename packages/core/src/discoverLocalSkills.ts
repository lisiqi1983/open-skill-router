import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  defaultAgentCompatibility,
  defaultSkillPermissions,
  parseSkillMd,
  type SkillReference,
} from "@openskillrouter/skill-spec";
import type { IndexedSkill, LocalSkillIndex } from "./types.js";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  "venv",
  ".env",
]);

export interface DiscoverLocalSkillsOptions {
  now?: Date;
}

export async function discoverLocalSkills(
  sourceRoot: string,
  options: DiscoverLocalSkillsOptions = {},
): Promise<LocalSkillIndex> {
  const rootPath = path.resolve(sourceRoot);
  const skillFiles = await findSkillFiles(rootPath);
  const indexedAt = (options.now ?? new Date()).toISOString();
  const skills = await Promise.all(
    skillFiles.map((skillFilePath) =>
      readSkill(rootPath, skillFilePath, indexedAt),
    ),
  );

  return {
    schemaVersion: "skillrouter.local-index/v1",
    generatedAt: indexedAt,
    sourceRoot: rootPath,
    skills: skills.sort((left, right) =>
      left.skill.id.localeCompare(right.skill.id),
    ),
  };
}

async function findSkillFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return results;
}

async function readSkill(
  sourceRoot: string,
  skillFilePath: string,
  indexedAt: string,
): Promise<IndexedSkill> {
  const content = await fs.readFile(skillFilePath, "utf8");
  const rootPath = path.dirname(skillFilePath);
  const relativeSkillRoot = toPosixPath(path.relative(sourceRoot, rootPath));
  const parsed = parseSkillMd(content, {
    fallbackName: path.basename(rootPath),
  });
  const metadataHash = sha256(JSON.stringify(parsed.frontmatter));
  const contentHash = `sha256:${sha256(content)}`;
  const locator = `local:${relativeSkillRoot || "."}`;
  const skill: SkillReference = {
    id: locator,
    sourceType: "local",
    sourceUrl: rootPath,
    locator,
    path: relativeSkillRoot,
    name: parsed.name,
    displayName: parsed.displayName,
    description: parsed.description,
    tags: parsed.tags,
    capabilities: parsed.capabilities,
    intents: parsed.intents,
    inputFormats: parsed.inputFormats,
    outputFormats: parsed.outputFormats,
    languages: parsed.languages,
    permissions: defaultSkillPermissions(),
    riskLevel: "unknown",
    compatibility: defaultAgentCompatibility(),
    indexedAt,
    contentHash,
    metadataHash,
    qualitySignals: {},
  };

  return {
    skill,
    skillFilePath,
    rootPath,
    body: parsed.body,
    indexedAt,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
