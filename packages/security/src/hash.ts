import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export function sha256String(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  return sha256String(await fs.readFile(filePath));
}

export async function hashDirectory(
  rootPath: string,
  relativeFiles: string[],
): Promise<string> {
  const hash = createHash("sha256");

  for (const relativeFile of [...relativeFiles].sort()) {
    const normalizedPath = relativeFile.split(path.sep).join("/");
    hash.update(normalizedPath);
    hash.update("\0");
    hash.update(await fs.readFile(path.join(rootPath, relativeFile)));
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}
