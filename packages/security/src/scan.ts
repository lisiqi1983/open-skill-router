import { promises as fs } from "node:fs";
import path from "node:path";
import type { RiskLevel, SkillPermissions } from "@openskillrouter/skill-spec";
import { hashDirectory, sha256File } from "./hash.js";
import type {
  PermissionDiff,
  PermissionInference,
  ScannedFile,
  ScriptFinding,
  SkillDirectoryScan,
} from "./types.js";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  "venv",
  ".env",
]);
const SCRIPT_EXTENSIONS = new Map<string, ScriptFinding["runtime"]>([
  [".py", "python"],
  [".js", "node"],
  [".mjs", "node"],
  [".cjs", "node"],
  [".ts", "node"],
  [".sh", "shell"],
  [".bash", "shell"],
  [".zsh", "shell"],
  [".ps1", "shell"],
  [".bat", "shell"],
  [".cmd", "shell"],
]);

export async function scanSkillDirectory(
  rootPath: string,
): Promise<SkillDirectoryScan> {
  const resolvedRoot = path.resolve(rootPath);
  const relativeFiles = await listRelativeFiles(resolvedRoot);
  const files = await Promise.all(
    relativeFiles.map(async (relativeFile): Promise<ScannedFile> => {
      const filePath = path.join(resolvedRoot, relativeFile);
      const stat = await fs.stat(filePath);
      return {
        path: toPosixPath(relativeFile),
        size: stat.size,
        sha256: await sha256File(filePath),
        executableHint: isScriptFile(relativeFile),
      };
    }),
  );
  const textCorpus = await buildTextCorpus(resolvedRoot, relativeFiles);
  const inference = inferPermissions(relativeFiles, textCorpus);

  return {
    rootPath: resolvedRoot,
    files,
    contentHash: await hashDirectory(resolvedRoot, relativeFiles),
    ...inference,
  };
}

export function inferPermissions(
  relativeFiles: string[],
  textCorpus: string,
): PermissionInference {
  const scriptFindings = detectScripts(relativeFiles);
  const lowerCorpus = textCorpus.toLowerCase();
  const reasons: string[] = [];
  const permissions: SkillPermissions = {
    filesystem: "none",
    network: {
      access: "none",
    },
    runtime: {
      python: "none",
      node: "none",
      shell: "none",
    },
    secrets: "none",
  };

  if (
    /(workspace|工作区|read file|读取文件|input file|docx|pdf|csv|xlsx)/i.test(
      textCorpus,
    )
  ) {
    permissions.filesystem = "workspace_read";
    reasons.push("Mentions reading workspace or user-provided files.");
  }

  if (
    /(write|save|generate|output|export|创建|生成|输出|保存|写入)/i.test(
      textCorpus,
    )
  ) {
    permissions.filesystem = "workspace_read_write";
    reasons.push("Mentions generating, saving, or exporting files.");
  }

  const domains = extractDomains(textCorpus);
  if (
    /(upload|post |curl |fetch\(|http:\/\/|https:\/\/|联网|网络|api)/i.test(
      textCorpus,
    )
  ) {
    permissions.network = {
      access: domains.length > 0 ? "allowlist" : "any",
      domains: domains.length > 0 ? domains : undefined,
    };
    reasons.push("Mentions network access or remote API usage.");
  }

  if (
    /(read|use|uses|using|require|requires|load|access|读取|使用|要求|加载|访问).{0,40}(api key|apikey|secret|token|env\.|process\.env|环境变量|密钥)/i.test(
      textCorpus,
    ) ||
    /(api key|apikey|secret|token|env\.|process\.env|环境变量|密钥).{0,40}(required|used|loaded|accessed|必须|需要|读取|使用|加载|访问)/i.test(
      textCorpus,
    )
  ) {
    permissions.secrets = "env_vars";
    reasons.push(
      "Mentions API keys, tokens, secrets, or environment variables.",
    );
  }

  for (const finding of scriptFindings) {
    reasons.push(finding.reason);
    if (finding.runtime === "python") permissions.runtime.python = "sandbox";
    if (finding.runtime === "node") permissions.runtime.node = "sandbox";
    if (finding.runtime === "shell") permissions.runtime.shell = "system";
    if (finding.runtime === "unknown") {
      permissions.runtime.python =
        permissions.runtime.python === "none"
          ? "unknown"
          : permissions.runtime.python;
      permissions.runtime.node =
        permissions.runtime.node === "none"
          ? "unknown"
          : permissions.runtime.node;
      permissions.runtime.shell =
        permissions.runtime.shell === "none"
          ? "unknown"
          : permissions.runtime.shell;
    }
  }

  const riskLevel = scoreRisk(permissions, scriptFindings, lowerCorpus);

  if (reasons.length === 0) {
    reasons.push(
      "Pure skill instructions with no scripts or elevated permissions detected.",
    );
  }

  return {
    permissions,
    riskLevel,
    reasons,
    scriptFindings,
  };
}

export function diffPermissions(
  previous: {
    permissions: SkillPermissions;
    riskLevel: RiskLevel;
    scriptCount: number;
    sourceUrl?: string;
  },
  next: {
    permissions: SkillPermissions;
    riskLevel: RiskLevel;
    scriptCount: number;
    sourceUrl?: string;
  },
): PermissionDiff {
  const reasons: string[] = [];

  if (riskRank(next.riskLevel) > riskRank(previous.riskLevel)) {
    reasons.push(
      `Risk level increases from ${previous.riskLevel} to ${next.riskLevel}.`,
    );
  }

  if (next.scriptCount > previous.scriptCount) {
    reasons.push("New executable script files were added.");
  }

  if (
    permissionRank(next.permissions.filesystem) >
    permissionRank(previous.permissions.filesystem)
  ) {
    reasons.push("Filesystem permissions expanded.");
  }

  if (
    networkRank(next.permissions.network.access) >
    networkRank(previous.permissions.network.access)
  ) {
    reasons.push("Network permissions expanded.");
  }

  if (
    runtimeRank(next.permissions.runtime.shell) >
    runtimeRank(previous.permissions.runtime.shell)
  ) {
    reasons.push("Shell runtime permissions expanded.");
  }

  if (
    runtimeRank(next.permissions.runtime.python) >
    runtimeRank(previous.permissions.runtime.python)
  ) {
    reasons.push("Python runtime permissions expanded.");
  }

  if (
    runtimeRank(next.permissions.runtime.node) >
    runtimeRank(previous.permissions.runtime.node)
  ) {
    reasons.push("Node runtime permissions expanded.");
  }

  if (
    secretRank(next.permissions.secrets) >
    secretRank(previous.permissions.secrets)
  ) {
    reasons.push("Secret access permissions expanded.");
  }

  if (reasons.length > 0) {
    return {
      classification: "requires_confirmation",
      reasons,
    };
  }

  return {
    classification: "safe",
    reasons: ["No permission expansion detected."],
  };
}

async function listRelativeFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }

      if (entry.isFile()) {
        results.push(path.relative(rootPath, entryPath));
      }
    }
  }

  await visit(rootPath);
  return results.sort();
}

async function buildTextCorpus(
  rootPath: string,
  relativeFiles: string[],
): Promise<string> {
  const snippets: string[] = [];

  for (const relativeFile of relativeFiles) {
    if (!isTextLike(relativeFile)) continue;
    const filePath = path.join(rootPath, relativeFile);
    const stat = await fs.stat(filePath);
    if (stat.size > 128_000) continue;
    snippets.push(await fs.readFile(filePath, "utf8"));
  }

  return snippets.join("\n");
}

function detectScripts(relativeFiles: string[]): ScriptFinding[] {
  const findings: ScriptFinding[] = [];

  for (const relativeFile of relativeFiles) {
    const normalized = toPosixPath(relativeFile);
    const extensionRuntime = SCRIPT_EXTENSIONS.get(
      path.extname(relativeFile).toLowerCase(),
    );
    const inScriptsDir = normalized.split("/").includes("scripts");

    if (!extensionRuntime && !inScriptsDir) continue;

    findings.push({
      path: normalized,
      runtime: extensionRuntime ?? "unknown",
      reason: inScriptsDir
        ? `Contains script-like file under scripts/: ${normalized}.`
        : `Contains executable script file: ${normalized}.`,
    });
  }

  return findings;
}

function scoreRisk(
  permissions: SkillPermissions,
  scriptFindings: ScriptFinding[],
  lowerCorpus: string,
): RiskLevel {
  if (
    permissions.runtime.shell === "system" ||
    permissions.network.access === "any" ||
    permissions.secrets === "env_vars" ||
    /(delete home|rm -rf|\.ssh|上传.*文件|upload.*file)/i.test(lowerCorpus)
  ) {
    return "high";
  }

  if (
    scriptFindings.length > 0 ||
    permissions.filesystem === "workspace_read_write" ||
    permissions.network.access === "allowlist" ||
    permissions.runtime.python === "sandbox" ||
    permissions.runtime.node === "sandbox"
  ) {
    return "medium";
  }

  if (
    permissions.filesystem === "none" &&
    permissions.network.access === "none" &&
    permissions.runtime.python === "none" &&
    permissions.runtime.node === "none" &&
    permissions.runtime.shell === "none" &&
    permissions.secrets === "none"
  ) {
    return "low";
  }

  return "unknown";
}

function isScriptFile(relativeFile: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(relativeFile).toLowerCase());
}

function isTextLike(relativeFile: string): boolean {
  const ext = path.extname(relativeFile).toLowerCase();
  return [
    "",
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".py",
    ".sh",
    ".bash",
    ".ps1",
    ".bat",
    ".cmd",
  ].includes(ext);
}

function extractDomains(text: string): string[] {
  const domains = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/([^/\s"')]+)/gi)) {
    domains.add(match[1]?.toLowerCase() ?? "");
  }
  return Array.from(domains).filter(Boolean).sort();
}

function riskRank(value: RiskLevel): number {
  return { low: 0, medium: 1, unknown: 2, high: 3 }[value];
}

function permissionRank(value: SkillPermissions["filesystem"]): number {
  return { none: 0, workspace_read: 1, workspace_read_write: 2, unknown: 3 }[
    value
  ];
}

function networkRank(value: SkillPermissions["network"]["access"]): number {
  return { none: 0, allowlist: 1, any: 2, unknown: 3 }[value];
}

function runtimeRank(
  value:
    | SkillPermissions["runtime"]["python"]
    | SkillPermissions["runtime"]["node"],
): number;
function runtimeRank(value: SkillPermissions["runtime"]["shell"]): number;
function runtimeRank(
  value: "none" | "sandbox" | "system" | "restricted" | "unknown",
): number {
  return { none: 0, sandbox: 1, restricted: 1, system: 2, unknown: 3 }[value];
}

function secretRank(value: SkillPermissions["secrets"]): number {
  return { none: 0, local_keychain: 1, env_vars: 2, unknown: 3 }[value];
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
