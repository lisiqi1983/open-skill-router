import { promises as fs } from "node:fs";
import path from "node:path";
import {
  installSkill,
  type InstallResult,
  type InstallSkillOptions,
} from "./install.js";
import { getSkillRouterHome } from "./paths.js";

export interface InitSkillRouterOptions extends InstallSkillOptions {
  entrySkillSource?: string;
}

export interface InitSkillRouterResult {
  homeDir: string;
  entrySkill: InstallResult;
}

export async function initSkillRouter(
  options: InitSkillRouterOptions = {},
): Promise<InitSkillRouterResult> {
  const homeDir = getSkillRouterHome(options.homeDir);
  await fs.mkdir(homeDir, { recursive: true });
  const entrySkillSource = path.resolve(
    options.entrySkillSource ?? "skills/open-skill-router",
  );
  const entrySkill = await installSkill(`local:${entrySkillSource}`, {
    ...options,
    homeDir,
    scope: options.scope ?? "user",
    agentHost: "generic",
  });

  return {
    homeDir,
    entrySkill,
  };
}
