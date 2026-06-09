import type { ParsedGitHubLocator } from "./types.js";

export function parseGithubLocator(input: string): ParsedGitHubLocator {
  if (!input.startsWith("github:")) {
    throw new Error(`Expected a github: locator, received "${input}".`);
  }

  const locatorBody = input.slice("github:".length).trim();
  if (!locatorBody) {
    throw new Error("GitHub locator is empty.");
  }

  const atIndex = locatorBody.lastIndexOf("@");
  const withoutRef = atIndex >= 0 ? locatorBody.slice(0, atIndex) : locatorBody;
  const ref = atIndex >= 0 ? locatorBody.slice(atIndex + 1) : undefined;
  const segments = withoutRef.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new Error(`GitHub locator must include owner and repo: "${input}".`);
  }

  const [owner, repo, ...pathSegments] = segments;
  const path = pathSegments.length > 0 ? pathSegments.join("/") : undefined;
  const id = `github:${owner}/${repo}${path ? `/${path}` : ""}`;
  const locator = `${id}${ref ? `@${ref}` : ""}`;

  return {
    kind: "github",
    owner,
    repo,
    path,
    ref,
    id,
    locator,
  };
}
