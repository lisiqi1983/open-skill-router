import { promises as fs } from "node:fs";
import path from "node:path";

export async function copyDirectory(
  source: string,
  destination: string,
): Promise<void> {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  async function visit(
    currentSource: string,
    currentDestination: string,
  ): Promise<void> {
    const entries = await fs.readdir(currentSource, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(currentSource, entry.name);
      const destinationPath = path.join(currentDestination, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destinationPath, { recursive: true });
        await visit(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        await fs.copyFile(sourcePath, destinationPath);
      }
    }
  }

  await visit(source, destination);
}

export async function ensureSkillDirectory(rootPath: string): Promise<void> {
  const skillPath = path.join(rootPath, "SKILL.md");
  try {
    const stat = await fs.stat(skillPath);
    if (!stat.isFile()) {
      throw new Error(`SKILL.md is not a file: ${skillPath}`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`No SKILL.md found in ${rootPath}.`);
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
