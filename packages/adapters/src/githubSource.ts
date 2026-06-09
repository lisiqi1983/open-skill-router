import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseGithubLocator } from "@openskillrouter/skill-spec";
import { ensureSkillDirectory } from "./fsUtils.js";
import type { FetchedSkillSource, FetchSkillSourceOptions } from "./types.js";

interface GitHubRepositoryResponse {
  default_branch: string;
}

interface GitHubCommitResponse {
  sha: string;
}

interface GitHubTreeResponse {
  tree: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree" | "commit";
    sha: string;
    size?: number;
    url: string;
  }>;
  truncated: boolean;
}

interface GitHubBlobResponse {
  content: string;
  encoding: string;
}

export async function fetchGitHubSkillSource(
  locator: string,
  options: FetchSkillSourceOptions = {},
): Promise<FetchedSkillSource> {
  const parsed = parseGithubLocator(locator);
  const fetchImpl = options.fetchImpl ?? fetch;
  const ref =
    parsed.ref ??
    (await getDefaultBranch(fetchImpl, parsed.owner, parsed.repo));
  const commitSha = await resolveCommit(
    fetchImpl,
    parsed.owner,
    parsed.repo,
    ref,
  );
  const tree = await getTree(fetchImpl, parsed.owner, parsed.repo, commitSha);
  const skillPath = parsed.path ? stripSlashes(parsed.path) : "";
  const skillPrefix = skillPath ? `${skillPath}/` : "";
  const files = tree.tree.filter((entry) => {
    if (entry.type !== "blob") return false;
    if (!skillPath) return true;
    return entry.path === skillPath || entry.path.startsWith(skillPrefix);
  });

  if (
    !files.some(
      (file) =>
        file.path === `${skillPrefix}SKILL.md` ||
        (!skillPath && file.path === "SKILL.md"),
    )
  ) {
    throw new Error(`No SKILL.md found for ${locator} at commit ${commitSha}.`);
  }

  const tmpRoot = await fs.mkdtemp(
    path.join(options.tmpRoot ?? tmpdir(), "skillrouter-github-"),
  );
  const rootPath = path.join(tmpRoot, "skill");
  await fs.mkdir(rootPath, { recursive: true });

  for (const file of files) {
    const relativePath = skillPath
      ? file.path.slice(skillPrefix.length)
      : file.path;
    if (!relativePath || relativePath.startsWith("../")) continue;
    const blob = await getBlob(fetchImpl, parsed.owner, parsed.repo, file.sha);
    const content = decodeBlob(blob);
    const destination = path.join(rootPath, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }

  await ensureSkillDirectory(rootPath);

  return {
    locator: parsed.locator,
    sourceType: "github",
    sourceUrl: `https://github.com/${parsed.owner}/${parsed.repo}${skillPath ? `/tree/${commitSha}/${skillPath}` : `/tree/${commitSha}`}`,
    rootPath,
    id: parsed.id,
    repo: `${parsed.owner}/${parsed.repo}`,
    path: skillPath,
    ref,
    commitSha,
    cleanup: async () => {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    },
  };
}

async function getDefaultBranch(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
): Promise<string> {
  const response = await githubJson<GitHubRepositoryResponse>(
    fetchImpl,
    `/repos/${owner}/${repo}`,
  );
  return response.default_branch;
}

async function resolveCommit(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  ref: string,
): Promise<string> {
  const response = await githubJson<GitHubCommitResponse>(
    fetchImpl,
    `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  return response.sha;
}

async function getTree(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<GitHubTreeResponse> {
  const tree = await githubJson<GitHubTreeResponse>(
    fetchImpl,
    `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
  );
  if (tree.truncated) {
    throw new Error(
      `GitHub tree for ${owner}/${repo}@${commitSha} is truncated; cannot safely fetch skill.`,
    );
  }
  return tree;
}

async function getBlob(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubBlobResponse> {
  return githubJson<GitHubBlobResponse>(
    fetchImpl,
    `/repos/${owner}/${repo}/git/blobs/${sha}`,
  );
}

async function githubJson<T>(
  fetchImpl: typeof fetch,
  pathName: string,
): Promise<T> {
  const response = await fetchImpl(`https://api.github.com${pathName}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "open-skill-router",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub request failed (${response.status}) for ${pathName}.`,
    );
  }

  return (await response.json()) as T;
}

function decodeBlob(blob: GitHubBlobResponse): Buffer {
  if (blob.encoding !== "base64") {
    throw new Error(`Unsupported GitHub blob encoding: ${blob.encoding}.`);
  }
  return Buffer.from(blob.content.replace(/\s/g, ""), "base64");
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}
