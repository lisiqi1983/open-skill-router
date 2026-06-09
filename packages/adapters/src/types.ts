import type { SourceType } from "@openskillrouter/skill-spec";

export interface FetchSkillSourceOptions {
  tmpRoot?: string;
  fetchImpl?: typeof fetch;
}

export interface FetchedSkillSource {
  locator: string;
  sourceType: SourceType;
  sourceUrl: string;
  rootPath: string;
  id: string;
  repo?: string;
  path?: string;
  ref?: string;
  commitSha: string;
  cleanup?: () => Promise<void>;
}

export interface AgentHostInstallOptions {
  skillCachePath: string;
  skillName: string;
  scope: "user" | "project";
  projectRoot?: string;
  targetDir?: string;
  homeDir?: string;
}

export interface AgentHostInstallResult {
  agentHost: string;
  installPath: string;
}
