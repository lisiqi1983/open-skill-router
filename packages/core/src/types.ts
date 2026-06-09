import type { RiskLevel, SkillReference } from "@openskillrouter/skill-spec";

export type RecommendationMode =
  | "fast_metadata"
  | "full_skill_rerank"
  | "strict_local";

export interface TaskProfile {
  taskText: string;
  language: "zh" | "en" | "mixed" | "unknown";
  userAgentHost?: "claude-code" | "codex" | "cursor" | "copilot" | "generic";
  intents: string[];
  keywords: string[];
  domain?: string;
  fileTypes: string[];
  outputRequirements: string[];
  constraints: string[];
  privacyMode: "strict" | "balanced" | "cloud";
  allowNetwork?: boolean;
  allowScripts?: boolean;
}

export interface IndexedSkill {
  skill: SkillReference;
  skillFilePath: string;
  rootPath: string;
  body: string;
  indexedAt: string;
}

export interface LocalSkillIndex {
  schemaVersion: "skillrouter.local-index/v1";
  generatedAt: string;
  sourceRoot: string;
  skills: IndexedSkill[];
}

export interface CandidatePack {
  schemaVersion: "skillrouter.candidate-pack/v1";
  generatedAt: string;
  mode: RecommendationMode;
  task: TaskProfile;
  limits: {
    maxCandidates: number;
    maxSkillBodyChars: number;
  };
  candidates: CandidateSkillDocument[];
}

export interface CandidateSkillDocument {
  skill: SkillReference;
  deterministicScore: number;
  matchedKeywords: string[];
  bodyExcerpt: string;
  fileTree: string[];
  riskSummary: {
    level: RiskLevel;
    reasons: string[];
  };
}

export interface SkillRecommendation {
  skill: SkillReference;
  score: number;
  confidence: "low" | "medium" | "high";
  rank: number;
  reasons: string[];
  covers: string[];
  missing: string[];
  risks: string[];
  installStatus:
    | "installed"
    | "not_installed"
    | "update_available"
    | "incompatible";
  recommendedAction:
    | "use"
    | "install"
    | "update_then_use"
    | "inspect_first"
    | "avoid";
  explanation: string;
  matchedKeywords: string[];
  scoreBreakdown: {
    metadataMatch: number;
    capabilityCoverage: number;
    inputOutputFit: number;
    safetyFit: number;
  };
}

export interface RecommendSkillsOptions {
  index: LocalSkillIndex;
  task: string;
  maxResults?: number;
  mode?: RecommendationMode;
  privacyMode?: TaskProfile["privacyMode"];
}

export interface RecommendSkillsResult {
  task: TaskProfile;
  recommendations: SkillRecommendation[];
  candidatePack?: CandidatePack;
}
