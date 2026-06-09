import type { RiskLevel, SkillPermissions } from "@openskillrouter/skill-spec";

export interface ScannedFile {
  path: string;
  size: number;
  sha256: string;
  executableHint: boolean;
}

export interface ScriptFinding {
  path: string;
  runtime: "python" | "node" | "shell" | "unknown";
  reason: string;
}

export interface PermissionInference {
  permissions: SkillPermissions;
  riskLevel: RiskLevel;
  reasons: string[];
  scriptFindings: ScriptFinding[];
}

export interface SkillDirectoryScan extends PermissionInference {
  rootPath: string;
  files: ScannedFile[];
  contentHash: string;
}

export type UpdateClassification =
  | "no_update"
  | "safe"
  | "requires_confirmation"
  | "blocked";

export interface PermissionDiff {
  classification: UpdateClassification;
  reasons: string[];
}
