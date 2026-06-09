import { promises as fs } from "node:fs";
import path from "node:path";
import type { LocalSkillIndex } from "./types.js";

export function defaultProjectIndexPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, ".skillrouter", "index.json");
}

export async function writeLocalSkillIndex(
  index: LocalSkillIndex,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export async function readLocalSkillIndex(
  indexPath: string,
): Promise<LocalSkillIndex> {
  const content = await fs.readFile(indexPath, "utf8");
  const parsed = JSON.parse(content) as LocalSkillIndex;

  if (
    parsed.schemaVersion !== "skillrouter.local-index/v1" ||
    !Array.isArray(parsed.skills)
  ) {
    throw new Error(`Unsupported or invalid local index: ${indexPath}`);
  }

  return parsed;
}
