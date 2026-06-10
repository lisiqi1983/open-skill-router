import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  IndexedSkill,
  LocalSkillIndex,
  StaticSkillIndexManifest,
  StaticSkillRecord,
} from "./types.js";

const STATIC_INDEX_FILE = "index.json";
const SKILLS_JSONL_FILE = "skills.jsonl";
const SKILLS_CHECKSUM_FILE = "skills.jsonl.sha256";

export interface WriteStaticSkillIndexOptions {
  name: string;
  description?: string;
  sourceManifest?: string;
  now?: Date;
}

export interface WriteStaticSkillIndexResult {
  manifest: StaticSkillIndexManifest;
  manifestPath: string;
  skillsPath: string;
  checksumPath: string;
}

export async function writeStaticSkillIndex(
  index: LocalSkillIndex,
  outputDir: string,
  options: WriteStaticSkillIndexOptions,
): Promise<WriteStaticSkillIndexResult> {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const records = index.skills.map(toStaticRecord);
  const jsonl = records
    .map((record) => JSON.stringify(record))
    .join("\n")
    .concat(records.length > 0 ? "\n" : "");
  const skillsSha256 = `sha256:${sha256(jsonl)}`;
  const manifest: StaticSkillIndexManifest = {
    schemaVersion: "skillrouter.static-index/v1",
    generatedAt,
    name: options.name,
    description: options.description,
    sourceManifest: options.sourceManifest,
    skillCount: records.length,
    skillsPath: SKILLS_JSONL_FILE,
    checksumPath: SKILLS_CHECKSUM_FILE,
    skillsSha256,
  };
  const manifestPath = path.join(outputDir, STATIC_INDEX_FILE);
  const skillsPath = path.join(outputDir, SKILLS_JSONL_FILE);
  const checksumPath = path.join(outputDir, SKILLS_CHECKSUM_FILE);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(skillsPath, jsonl, "utf8");
  await fs.writeFile(
    checksumPath,
    `${skillsSha256}  ${SKILLS_JSONL_FILE}\n`,
    "utf8",
  );
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return {
    manifest,
    manifestPath,
    skillsPath,
    checksumPath,
  };
}

export async function readStaticSkillIndex(
  source: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<LocalSkillIndex> {
  if (isHttpUrl(source)) {
    return readRemoteStaticSkillIndex(source, options.fetchImpl ?? fetch);
  }
  return readLocalStaticSkillIndex(source);
}

export function parseStaticSkillRecords(jsonl: string): StaticSkillRecord[] {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = JSON.parse(line) as StaticSkillRecord;
      if (parsed.schemaVersion !== "skillrouter.skill-record/v1") {
        throw new Error(`Invalid skill record schema at line ${index + 1}.`);
      }
      return parsed;
    });
}

async function readLocalStaticSkillIndex(
  source: string,
): Promise<LocalSkillIndex> {
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    const manifestPath = path.join(source, STATIC_INDEX_FILE);
    const manifest = parseStaticIndexManifest(
      await fs.readFile(manifestPath, "utf8"),
      manifestPath,
    );
    const skillsPath = path.resolve(source, manifest.skillsPath);
    const skillsJsonl = await fs.readFile(skillsPath, "utf8");
    verifySha256(skillsJsonl, manifest.skillsSha256, skillsPath);
    return recordsToLocalIndex(
      parseStaticSkillRecords(skillsJsonl),
      source,
      manifest.generatedAt,
    );
  }

  if (source.endsWith(".json")) {
    const manifest = parseStaticIndexManifest(
      await fs.readFile(source, "utf8"),
      source,
    );
    const sourceDir = path.dirname(source);
    const skillsPath = path.resolve(sourceDir, manifest.skillsPath);
    const skillsJsonl = await fs.readFile(skillsPath, "utf8");
    verifySha256(skillsJsonl, manifest.skillsSha256, skillsPath);
    return recordsToLocalIndex(
      parseStaticSkillRecords(skillsJsonl),
      source,
      manifest.generatedAt,
    );
  }

  const jsonl = await fs.readFile(source, "utf8");
  return recordsToLocalIndex(parseStaticSkillRecords(jsonl), source);
}

async function readRemoteStaticSkillIndex(
  source: string,
  fetchImpl: typeof fetch,
): Promise<LocalSkillIndex> {
  if (source.endsWith(".jsonl")) {
    const jsonl = await fetchText(fetchImpl, source);
    return recordsToLocalIndex(parseStaticSkillRecords(jsonl), source);
  }

  const manifestUrl = source.endsWith(".json")
    ? source
    : new URL(STATIC_INDEX_FILE, ensureTrailingSlash(source)).toString();
  const manifest = parseStaticIndexManifest(
    await fetchText(fetchImpl, manifestUrl),
    manifestUrl,
  );
  const skillsUrl = new URL(manifest.skillsPath, manifestUrl).toString();
  const skillsJsonl = await fetchText(fetchImpl, skillsUrl);
  verifySha256(skillsJsonl, manifest.skillsSha256, skillsUrl);
  return recordsToLocalIndex(
    parseStaticSkillRecords(skillsJsonl),
    source,
    manifest.generatedAt,
  );
}

function parseStaticIndexManifest(
  content: string,
  source: string,
): StaticSkillIndexManifest {
  const parsed = JSON.parse(content) as StaticSkillIndexManifest;
  if (
    parsed.schemaVersion !== "skillrouter.static-index/v1" ||
    typeof parsed.skillsPath !== "string" ||
    typeof parsed.skillsSha256 !== "string"
  ) {
    throw new Error(`Invalid static skill index manifest: ${source}`);
  }
  return parsed;
}

function recordsToLocalIndex(
  records: StaticSkillRecord[],
  sourceRoot: string,
  generatedAt?: string,
): LocalSkillIndex {
  return {
    schemaVersion: "skillrouter.local-index/v1",
    generatedAt: generatedAt ?? new Date().toISOString(),
    sourceRoot,
    skills: records.map((record) => ({
      skill: record.skill,
      skillFilePath: record.skillFilePath,
      rootPath: record.rootPath,
      body: record.body,
      indexedAt: record.indexedAt,
    })),
  };
}

function toStaticRecord(indexedSkill: IndexedSkill): StaticSkillRecord {
  return {
    schemaVersion: "skillrouter.skill-record/v1",
    skill: indexedSkill.skill,
    skillFilePath: indexedSkill.skillFilePath,
    rootPath: indexedSkill.rootPath,
    body: indexedSkill.body,
    indexedAt: indexedSkill.indexedAt,
  };
}

async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": "open-skill-router",
    },
  });
  if (!response.ok) {
    throw new Error(`Static index request failed (${response.status}): ${url}`);
  }
  return response.text();
}

function verifySha256(content: string, expected: string, source: string): void {
  const actual = `sha256:${sha256(content)}`;
  if (actual !== expected) {
    throw new Error(
      `Static index checksum mismatch for ${source}: expected ${expected}, got ${actual}.`,
    );
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
