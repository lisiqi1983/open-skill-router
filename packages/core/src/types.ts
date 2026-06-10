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
  rerankContract: {
    guardrails: string[];
    outputSchema: Record<string, unknown>;
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
  deterministicScore?: number;
  modelRerankScore?: number;
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
    userModelRerank?: number;
  };
}

export interface ModelSkillRanking {
  skill_id: string;
  score: number;
  reasons?: string[];
  covers?: string[];
  missing?: string[];
  risks?: string[];
  recommended_action?: SkillRecommendation["recommendedAction"];
}

export interface ModelSkillCombination {
  needed: boolean;
  skills: string[];
  reason?: string;
}

export interface ModelRerankOutput {
  schemaVersion?: "skillrouter.model-rerank/v1";
  rankings: ModelSkillRanking[];
  combination?: ModelSkillCombination;
}

export interface ModelRerankValidationIssue {
  path: string;
  message: string;
}

export interface ModelRerankValidation {
  valid: boolean;
  issues: ModelRerankValidationIssue[];
  ignoredSkillIds: string[];
}

export interface ModelRerankApplication {
  applied: boolean;
  validation: ModelRerankValidation;
  combination?: ModelSkillCombination;
}

export interface RecommendSkillsOptions {
  index: LocalSkillIndex;
  task: string;
  maxResults?: number;
  mode?: RecommendationMode;
  privacyMode?: TaskProfile["privacyMode"];
  modelRerank?: ModelRerankOutput;
}

export interface RecommendSkillsResult {
  task: TaskProfile;
  recommendations: SkillRecommendation[];
  candidatePack?: CandidatePack;
  modelRerank?: ModelRerankApplication;
}
