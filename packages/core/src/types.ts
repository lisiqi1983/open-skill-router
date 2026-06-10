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
  environments: string[];
  workflowStages: string[];
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
  invalidSkills?: InvalidIndexedSkill[];
}

export interface InvalidIndexedSkill {
  skillFilePath: string;
  rootPath: string;
  error: string;
}

export interface SkillCatalog {
  schemaVersion: "skillrouter.catalog/v1";
  generatedAt: string;
  sourceRoot: string;
  skillCount: number;
  cards: SkillCatalogCard[];
  summary: SkillCatalogSummary;
}

export interface SkillCatalogCard {
  skillId: string;
  name: string;
  displayName?: string;
  description: string;
  locator: string;
  sourceType: SkillReference["sourceType"];
  sourceUrl: string;
  dimensions: SkillCatalogDimensions;
  qualitySignals: SkillReference["qualitySignals"];
  indexedAt: string;
  updatedAt?: string;
  contentHash?: string;
}

export interface SkillCatalogDimensions {
  intents: string[];
  domains: string[];
  capabilities: string[];
  inputFormats: string[];
  outputFormats: string[];
  environments: string[];
  workflowStages: string[];
  languages: string[];
  riskLevel: RiskLevel;
}

export interface SkillCatalogSummary {
  sourceTypes: SkillCatalogCount[];
  domains: SkillCatalogCount[];
  intents: SkillCatalogCount[];
  capabilities: SkillCatalogCount[];
  inputFormats: SkillCatalogCount[];
  outputFormats: SkillCatalogCount[];
  environments: SkillCatalogCount[];
  workflowStages: SkillCatalogCount[];
  languages: SkillCatalogCount[];
  riskLevels: SkillCatalogCount[];
}

export interface SkillCatalogCount {
  value: string;
  count: number;
}

export type SkillCatalogAnalysisDimension =
  | "domains"
  | "intents"
  | "capabilities"
  | "inputFormats"
  | "outputFormats"
  | "environments"
  | "workflowStages"
  | "languages"
  | "riskLevel"
  | "sourceType";

export interface SkillCatalogAnalysis {
  schemaVersion: "skillrouter.catalog-analysis/v1";
  generatedAt: string;
  sourceRoot: string;
  skillCount: number;
  dimensions: SkillCatalogDimensionAnalysis[];
  matrixSlices: SkillCatalogMatrixSlice[];
  skillProfiles: SkillCatalogSkillProfile[];
  gaps: SkillCatalogGap[];
}

export interface SkillCatalogDimensionAnalysis {
  dimension: SkillCatalogAnalysisDimension;
  coveredSkillCount: number;
  totalSkillCount: number;
  coveragePercent: number;
  distinctValueCount: number;
  topValues: SkillCatalogCount[];
  singletonValues: SkillCatalogCount[];
  unclassifiedSkillIds: string[];
}

export interface SkillCatalogMatrixSlice {
  name: string;
  rowDimension: SkillCatalogAnalysisDimension;
  columnDimension: SkillCatalogAnalysisDimension;
  cells: SkillCatalogMatrixCell[];
}

export interface SkillCatalogMatrixCell {
  rowValue: string;
  columnValue: string;
  count: number;
  skillIds: string[];
}

export interface SkillCatalogSkillProfile {
  skillId: string;
  name: string;
  displayName?: string;
  sourceType: SkillReference["sourceType"];
  riskLevel: RiskLevel;
  qualityScore: number;
  primaryDimensions: {
    domains: string[];
    intents: string[];
    capabilities: string[];
    inputFormats: string[];
    outputFormats: string[];
    environments: string[];
    workflowStages: string[];
    languages: string[];
  };
  vectorKey: string;
}

export interface SkillCatalogGap {
  type: "missing_dimension" | "sparse_dimension" | "unknown_risk" | "high_risk";
  severity: "info" | "warning";
  message: string;
  dimension?: SkillCatalogAnalysisDimension;
  value?: string;
  skillIds: string[];
}

export interface SourceManifest {
  schema_version: "skillrouter.source/v1";
  name: string;
  description?: string;
  maintainer?: string;
  updated_at?: string;
  sources?: SourceManifestSource[];
  skills?: SourceManifestSkill[];
}

export type SourceManifestSource =
  | {
      type: "local";
      path: string;
      include?: string[];
      tags?: string[];
      notes?: string;
    }
  | {
      type: "github";
      repo: string;
      ref?: string;
      include?: string[];
      tags?: string[];
      notes?: string;
    };

export interface SourceManifestSkill {
  id?: string;
  source:
    | {
        type: "local";
        path: string;
      }
    | {
        type: "github";
        repo: string;
        path: string;
        ref?: string;
      };
  tags?: string[];
  notes?: string;
}

export interface StaticSkillIndexManifest {
  schemaVersion: "skillrouter.static-index/v1";
  generatedAt: string;
  name: string;
  description?: string;
  sourceManifest?: string;
  skillCount: number;
  skillsPath: string;
  checksumPath: string;
  skillsSha256: string;
}

export interface StaticSkillRecord {
  schemaVersion: "skillrouter.skill-record/v1";
  skill: IndexedSkill["skill"];
  skillFilePath: string;
  rootPath: string;
  body: string;
  indexedAt: string;
}

export interface SkillSourceRegistryEntry {
  name: string;
  url: string;
  mirrors?: string[];
  addedAt: string;
  enabled: boolean;
}

export interface SkillSourceRegistry {
  schemaVersion: "skillrouter.sources/v1";
  updatedAt: string;
  sources: SkillSourceRegistryEntry[];
}

export interface StaticSourceHealthCheck {
  source: string;
  role: "primary" | "mirror" | "direct";
  ok: boolean;
  generatedAt?: string;
  skillCount?: number;
  skillsSha256?: string;
  checksumMatchesPrimary?: boolean;
  cachePath?: string;
  error?: string;
}

export interface StaticSourceHealthReport {
  schemaVersion: "skillrouter.source-health/v1";
  checkedAt: string;
  nameOrUrl: string;
  selectedSource?: string;
  checks: StaticSourceHealthCheck[];
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
  scoreBreakdown: RecommendationScoreBreakdown;
}

export interface RecommendationScoreBreakdown {
  metadataMatch: number;
  capabilityCoverage: number;
  inputOutputFit: number;
  safetyFit: number;
  catalogIntentFit?: number;
  domainFit?: number;
  environmentFit?: number;
  workflowFit?: number;
  qualityFit?: number;
  userModelRerank?: number;
}

export interface RecommendationScoringWeights {
  metadataMatch: number;
  capabilityCoverage: number;
  catalogIntentFit: number;
  domainFit: number;
  inputOutputFit: number;
  environmentFit: number;
  workflowFit: number;
  qualityFit: number;
  safetyFit: number;
}

export interface ModelRerankScoringWeights {
  deterministicScore: number;
  userModelRerank: number;
}

export interface RecommendationScoringConfig {
  schemaVersion?: "skillrouter.scoring/v1";
  weights?: Partial<RecommendationScoringWeights>;
  modelRerankWeights?: Partial<ModelRerankScoringWeights>;
}

export interface ResolvedRecommendationScoringConfig {
  weights: RecommendationScoringWeights;
  modelRerankWeights: ModelRerankScoringWeights;
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
  scoring?: RecommendationScoringConfig;
}

export interface RecommendSkillsResult {
  task: TaskProfile;
  recommendations: SkillRecommendation[];
  candidatePack?: CandidatePack;
  modelRerank?: ModelRerankApplication;
}
