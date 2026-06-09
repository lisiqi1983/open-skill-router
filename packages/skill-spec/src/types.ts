export type SourceType =
  | "github"
  | "local"
  | "mcp_registry"
  | "agent_skills_registry"
  | "custom";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface SkillPermissions {
  filesystem: "none" | "workspace_read" | "workspace_read_write" | "unknown";
  network: {
    access: "none" | "allowlist" | "any" | "unknown";
    domains?: string[];
  };
  runtime: {
    python: "none" | "sandbox" | "system" | "unknown";
    node: "none" | "sandbox" | "system" | "unknown";
    shell: "none" | "restricted" | "system" | "unknown";
  };
  secrets: "none" | "local_keychain" | "env_vars" | "unknown";
}

export interface AgentCompatibility {
  genericAgentSkills: boolean;
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  copilot?: boolean;
  notes?: string[];
}

export interface SkillReference {
  id: string;
  sourceType: SourceType;
  sourceUrl: string;
  locator: string;
  repo?: string;
  path?: string;
  ref?: string;
  commitSha?: string;
  name: string;
  displayName?: string;
  description: string;
  readmeSummary?: string;
  author?: string;
  license?: string;
  tags: string[];
  capabilities: string[];
  intents: string[];
  inputFormats: string[];
  outputFormats: string[];
  languages: string[];
  permissions: SkillPermissions;
  riskLevel: RiskLevel;
  compatibility: AgentCompatibility;
  indexedAt: string;
  updatedAt?: string;
  contentHash?: string;
  metadataHash: string;
  qualitySignals: {
    stars?: number;
    forks?: number;
    downloads?: number;
    userRating?: number;
    installCount?: number;
    lastCommitAt?: string;
    verifiedPublisher?: boolean;
  };
}

export interface ParsedSkillDocument {
  frontmatter: Record<string, unknown>;
  body: string;
  name: string;
  displayName?: string;
  description: string;
  tags: string[];
  capabilities: string[];
  intents: string[];
  inputFormats: string[];
  outputFormats: string[];
  languages: string[];
}

export interface ParsedGitHubLocator {
  kind: "github";
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
  id: string;
  locator: string;
}
