import { createHash } from "node:crypto";
import path from "node:path";
import type { FetchedSkillSource } from "@openskillrouter/adapters";
import { getSkillRouterHome } from "./paths.js";

export function getCachedSkillPath(
  source: FetchedSkillSource,
  homeDir?: string,
): string {
  const home = getSkillRouterHome(homeDir);
  if (source.sourceType === "github" && source.repo) {
    const [owner, repo] = source.repo.split("/");
    const pathHash = shortHash(source.path || ".");
    return path.join(
      home,
      "cache",
      "github",
      owner ?? "unknown",
      repo ?? "repo",
      pathHash,
      "commits",
      source.commitSha,
    );
  }

  const sourceHash = shortHash(source.sourceUrl);
  return path.join(
    home,
    "cache",
    source.sourceType,
    sourceHash,
    "commits",
    source.commitSha,
  );
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
