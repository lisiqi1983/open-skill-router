import type { AgentCompatibility, SkillPermissions } from "./types.js";

export const defaultSkillPermissions = (): SkillPermissions => ({
  filesystem: "unknown",
  network: {
    access: "unknown",
  },
  runtime: {
    python: "unknown",
    node: "unknown",
    shell: "unknown",
  },
  secrets: "unknown",
});

export const defaultAgentCompatibility = (): AgentCompatibility => ({
  genericAgentSkills: true,
});
