import { fetchGitHubSkillSource } from "./githubSource.js";
import { fetchLocalSkillSource, isLocalLocator } from "./localSource.js";
import type { FetchedSkillSource, FetchSkillSourceOptions } from "./types.js";

export async function fetchSkillSource(
  locator: string,
  options: FetchSkillSourceOptions = {},
): Promise<FetchedSkillSource> {
  if (locator.startsWith("github:")) {
    return fetchGitHubSkillSource(locator, options);
  }

  if (isLocalLocator(locator)) {
    return fetchLocalSkillSource(locator);
  }

  throw new Error(`Unsupported skill locator: ${locator}`);
}
