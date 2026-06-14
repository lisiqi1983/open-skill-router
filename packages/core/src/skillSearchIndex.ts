import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillSearchIndex } from "./types.js";

export function defaultProjectSearchIndexPath(
  projectRoot = process.cwd(),
): string {
  return path.join(projectRoot, ".skillrouter", "search-index.json");
}

export async function writeSkillSearchIndex(
  searchIndex: SkillSearchIndex,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(searchIndex, null, 2)}\n`,
    "utf8",
  );
}

export async function readSkillSearchIndex(
  indexPath: string,
): Promise<SkillSearchIndex> {
  const content = await fs.readFile(indexPath, "utf8");
  return parseSkillSearchIndex(content, indexPath);
}

export function parseSkillSearchIndex(
  content: string,
  source: string,
): SkillSearchIndex {
  const parsed = JSON.parse(content) as SkillSearchIndex;

  if (
    parsed.schemaVersion !== "skillrouter.search-index/v1" ||
    !Array.isArray(parsed.documents)
  ) {
    throw new Error(`Unsupported or invalid Skill search index: ${source}`);
  }

  return parsed;
}
