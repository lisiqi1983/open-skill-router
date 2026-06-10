import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  IndexedSkill,
  LocalSkillIndex,
  StaticSourceHealthCheck,
  StaticSourceHealthReport,
  StaticSkillIndexManifest,
  StaticSkillRecord,
} from "./types.js";

export const STATIC_INDEX_FILE = "index.json";
export const SKILLS_JSONL_FILE = "skills.jsonl";
export const SKILLS_CHECKSUM_FILE = "skills.jsonl.sha256";

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

export interface ReadStaticSkillIndexOptions {
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  useCache?: boolean;
}

export interface LoadedStaticSkillIndex {
  index: LocalSkillIndex;
  manifest?: StaticSkillIndexManifest;
  skillsSha256?: string;
  cachePath?: string;
}

interface StaticSourceDescriptor {
  manifest?: StaticSkillIndexManifest;
  jsonl: string;
  generatedAt?: string;
  skillsSha256?: string;
  cachePath?: string;
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
  source: string | string[],
  options: ReadStaticSkillIndexOptions = {},
): Promise<LocalSkillIndex> {
  const loaded = await loadStaticSkillIndex(source, options);
  return loaded.index;
}

export async function loadStaticSkillIndex(
  source: string | string[],
  options: ReadStaticSkillIndexOptions = {},
): Promise<LoadedStaticSkillIndex> {
  const sources = Array.isArray(source) ? source : [source];
  const errors: string[] = [];

  for (const candidate of sources) {
    try {
      return await loadSingleStaticSkillIndex(candidate, options);
    } catch (error) {
      errors.push(`${candidate}: ${errorMessage(error)}`);
    }
  }

  throw new Error(
    `Unable to read static skill index from configured sources. ${errors.join(" ")}`,
  );
}

export async function checkStaticSourceHealth(
  nameOrUrl: string,
  sources: string[],
  options: ReadStaticSkillIndexOptions & { now?: Date } = {},
): Promise<StaticSourceHealthReport> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  const checks: StaticSourceHealthCheck[] = [];
  let selectedSource: string | undefined;
  let primarySha: string | undefined;

  for (const [index, source] of sources.entries()) {
    const role =
      sources.length === 1 ? "direct" : index === 0 ? "primary" : "mirror";
    try {
      const descriptor = await readStaticSourceDescriptor(source, {
        ...options,
        useCache: options.useCache ?? false,
      });
      const records = parseStaticSkillRecords(descriptor.jsonl);
      const skillsSha256 =
        descriptor.skillsSha256 ?? `sha256:${sha256(descriptor.jsonl)}`;
      if (!primarySha) primarySha = skillsSha256;
      if (!selectedSource) selectedSource = source;

      checks.push({
        source,
        role,
        ok: true,
        generatedAt: descriptor.generatedAt,
        skillCount: records.length,
        skillsSha256,
        checksumMatchesPrimary: skillsSha256 === primarySha,
        cachePath: descriptor.cachePath,
      });
    } catch (error) {
      checks.push({
        source,
        role,
        ok: false,
        error: errorMessage(error),
      });
    }
  }

  return {
    schemaVersion: "skillrouter.source-health/v1",
    checkedAt,
    nameOrUrl,
    selectedSource,
    checks,
  };
}

export function defaultStaticSnapshotCacheDir(homeDir?: string): string {
  return path.join(
    homeDir ?? path.join(homedir(), ".skillrouter"),
    "cache",
    "static-sources",
  );
}

async function loadSingleStaticSkillIndex(
  source: string,
  options: ReadStaticSkillIndexOptions,
): Promise<LoadedStaticSkillIndex> {
  const descriptor = await readStaticSourceDescriptor(source, options);
  return {
    index: recordsToLocalIndex(
      parseStaticSkillRecords(descriptor.jsonl),
      source,
      descriptor.generatedAt,
    ),
    manifest: descriptor.manifest,
    skillsSha256: descriptor.skillsSha256,
    cachePath: descriptor.cachePath,
  };
}

async function readStaticSourceDescriptor(
  source: string,
  options: ReadStaticSkillIndexOptions,
): Promise<StaticSourceDescriptor> {
  if (isHttpUrl(source)) {
    return readRemoteStaticSourceDescriptor(source, options);
  }
  return readLocalStaticSourceDescriptor(source);
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

async function readLocalStaticSourceDescriptor(
  source: string,
): Promise<StaticSourceDescriptor> {
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
    return {
      manifest,
      jsonl: skillsJsonl,
      generatedAt: manifest.generatedAt,
      skillsSha256: manifest.skillsSha256,
    };
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
    return {
      manifest,
      jsonl: skillsJsonl,
      generatedAt: manifest.generatedAt,
      skillsSha256: manifest.skillsSha256,
    };
  }

  const jsonl = await fs.readFile(source, "utf8");
  return {
    jsonl,
    skillsSha256: `sha256:${sha256(jsonl)}`,
  };
}

async function readRemoteStaticSourceDescriptor(
  source: string,
  options: ReadStaticSkillIndexOptions,
): Promise<StaticSourceDescriptor> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const useCache = options.useCache ?? true;
  const cacheDir = options.cacheDir ?? defaultStaticSnapshotCacheDir();
  const cachePath = path.join(cacheDir, sha256(source));

  try {
    const descriptor = source.endsWith(".jsonl")
      ? await fetchRemoteJsonlDescriptor(source, fetchImpl)
      : await fetchRemoteManifestDescriptor(source, fetchImpl);
    if (useCache) {
      await writeCachedRemoteDescriptor(cachePath, descriptor);
      descriptor.cachePath = cachePath;
    }
    return descriptor;
  } catch (error) {
    if (!useCache) throw error;
    try {
      return {
        ...(await readCachedRemoteDescriptor(cachePath)),
        cachePath,
      };
    } catch {
      throw error;
    }
  }
}

async function fetchRemoteJsonlDescriptor(
  source: string,
  fetchImpl: typeof fetch,
): Promise<StaticSourceDescriptor> {
  const jsonl = await fetchText(fetchImpl, source);
  parseStaticSkillRecords(jsonl);
  return {
    jsonl,
    skillsSha256: `sha256:${sha256(jsonl)}`,
  };
}

async function fetchRemoteManifestDescriptor(
  source: string,
  fetchImpl: typeof fetch,
): Promise<StaticSourceDescriptor> {
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
  return {
    manifest,
    jsonl: skillsJsonl,
    generatedAt: manifest.generatedAt,
    skillsSha256: manifest.skillsSha256,
  };
}

async function writeCachedRemoteDescriptor(
  cachePath: string,
  descriptor: StaticSourceDescriptor,
): Promise<void> {
  await fs.mkdir(cachePath, { recursive: true });
  await fs.writeFile(
    path.join(cachePath, SKILLS_JSONL_FILE),
    descriptor.jsonl,
    "utf8",
  );
  await fs.writeFile(
    path.join(cachePath, SKILLS_CHECKSUM_FILE),
    `${descriptor.skillsSha256 ?? `sha256:${sha256(descriptor.jsonl)}`}  ${SKILLS_JSONL_FILE}\n`,
    "utf8",
  );
  if (descriptor.manifest) {
    await fs.writeFile(
      path.join(cachePath, STATIC_INDEX_FILE),
      `${JSON.stringify(descriptor.manifest, null, 2)}\n`,
      "utf8",
    );
  }
}

async function readCachedRemoteDescriptor(
  cachePath: string,
): Promise<StaticSourceDescriptor> {
  const jsonl = await fs.readFile(
    path.join(cachePath, SKILLS_JSONL_FILE),
    "utf8",
  );
  const manifestPath = path.join(cachePath, STATIC_INDEX_FILE);
  let manifest: StaticSkillIndexManifest | undefined;
  try {
    manifest = parseStaticIndexManifest(
      await fs.readFile(manifestPath, "utf8"),
      manifestPath,
    );
    verifySha256(
      jsonl,
      manifest.skillsSha256,
      path.join(cachePath, SKILLS_JSONL_FILE),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    manifest,
    jsonl,
    generatedAt: manifest?.generatedAt,
    skillsSha256: manifest?.skillsSha256 ?? `sha256:${sha256(jsonl)}`,
  };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
