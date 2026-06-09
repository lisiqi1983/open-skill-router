import { homedir } from "node:os";
import path from "node:path";

export function getSkillRouterHome(homeDir?: string): string {
  return path.resolve(homeDir ?? path.join(homedir(), ".skillrouter"));
}

export function getGlobalLockfilePath(homeDir?: string): string {
  return path.join(
    getSkillRouterHome(homeDir),
    "locks",
    "global.skillrouter.lock",
  );
}

export function getProjectLockfilePath(projectRoot = process.cwd()): string {
  return path.join(path.resolve(projectRoot), ".skillrouter.lock");
}

export function getLockfilePath(options: {
  scope: "user" | "project";
  homeDir?: string;
  projectRoot?: string;
}): string {
  return options.scope === "project"
    ? getProjectLockfilePath(options.projectRoot)
    : getGlobalLockfilePath(options.homeDir);
}
