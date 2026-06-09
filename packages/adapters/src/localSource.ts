import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureSkillDirectory } from "./fsUtils.js";
import type { FetchedSkillSource } from "./types.js";

export function isLocalLocator(locator: string): boolean {
  return (
    locator.startsWith("local:") ||
    locator.startsWith(".") ||
    locator.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(locator)
  );
}

export async function fetchLocalSkillSource(
  locator: string,
): Promise<FetchedSkillSource> {
  const localPath = locator.startsWith("local:")
    ? locator.slice("local:".length)
    : locator;
  const rootPath = path.resolve(localPath);
  await ensureSkillDirectory(rootPath);
  const stat = await fs.stat(rootPath);
  if (!stat.isDirectory()) {
    throw new Error(`Local skill source is not a directory: ${rootPath}`);
  }

  const commitSha = `local-${Math.floor(stat.mtimeMs).toString(16)}`;
  const normalizedLocator = `local:${rootPath}`;

  return {
    locator: normalizedLocator,
    sourceType: "local",
    sourceUrl: rootPath,
    rootPath,
    id: normalizedLocator,
    path: rootPath,
    commitSha,
  };
}
