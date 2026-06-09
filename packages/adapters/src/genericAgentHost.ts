import { homedir } from "node:os";
import path from "node:path";
import { copyDirectory } from "./fsUtils.js";
import type {
  AgentHostInstallOptions,
  AgentHostInstallResult,
} from "./types.js";

export const GENERIC_AGENT_HOST_ID = "generic";

export function getGenericAgentSkillDir(options: {
  scope: "user" | "project";
  projectRoot?: string;
  targetDir?: string;
  homeDir?: string;
}): string {
  if (options.targetDir) return path.resolve(options.targetDir);
  if (options.scope === "project") {
    return path.join(
      path.resolve(options.projectRoot ?? process.cwd()),
      ".agent-skills",
      "skills",
    );
  }
  return path.join(
    options.homeDir ?? homedir(),
    ".skillrouter",
    "agent-hosts",
    "generic",
    "skills",
  );
}

export async function installGenericAgentSkill(
  options: AgentHostInstallOptions,
): Promise<AgentHostInstallResult> {
  const skillDir = getGenericAgentSkillDir(options);
  const installPath = path.join(skillDir, sanitizeSkillName(options.skillName));
  await copyDirectory(options.skillCachePath, installPath);

  return {
    agentHost: GENERIC_AGENT_HOST_ID,
    installPath,
  };
}

function sanitizeSkillName(value: string): string {
  return (
    value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "skill"
  );
}
