import { createHash } from "node:crypto";
import type { RiskLevel, SourceType } from "@openskillrouter/skill-spec";
import { buildSkillCatalog } from "./skillCatalog.js";
import { profileTask } from "./taskProfile.js";
import { tokenizeText } from "./tokenize.js";
import type {
  IndexedSkill,
  LocalSkillIndex,
  SearchSkillIndexOptions,
  SearchSkillsOptions,
  SearchSkillsResult,
  SkillCatalogCard,
  SkillSearchIndex,
  SkillSearchIndexBuildOptions,
  SkillSearchIndexBuildResult,
  SkillSearchIndexDocument,
  SkillSearchIndexFreshnessReport,
  SkillSearchHit,
  TaskProfile,
} from "./types.js";

interface SearchDocument {
  indexedSkill: IndexedSkill;
  catalogCard: SkillCatalogCard;
  text: string;
  tokenCounts: Map<string, number>;
  tokenSet: Set<string>;
  tokenCount: number;
  skillFingerprint: string;
  skillVector: Map<string, number>;
}

interface ScoredSearchDocument {
  document: SearchDocument;
  rawLexical: number;
  semantic: number;
  catalog: number;
  quality: number;
  safety: number;
}

interface LexicalStats {
  averageDocumentLength: number;
  tokens: Map<string, { idf: number }>;
}

type SearchFilters = Pick<
  SearchSkillsOptions,
  | "localOnly"
  | "sourceTypes"
  | "riskLevels"
  | "domains"
  | "intents"
  | "environments"
>;

export function searchSkills(options: SearchSkillsOptions): SearchSkillsResult {
  const searchIndex = buildSkillSearchIndex(options.index);
  const { index: _index, ...searchOptions } = options;
  return searchSkillIndex({ ...searchOptions, searchIndex });
}

export function buildSkillSearchIndex(
  index: LocalSkillIndex,
  options: SkillSearchIndexBuildOptions = {},
): SkillSearchIndex {
  return buildSkillSearchIndexWithStats(index, options).searchIndex;
}

export function buildSkillSearchIndexWithStats(
  index: LocalSkillIndex,
  options: SkillSearchIndexBuildOptions = {},
): SkillSearchIndexBuildResult {
  const catalogBySkillId = new Map(
    buildSkillCatalog(index).cards.map((card) => [card.skillId, card]),
  );
  const previousDocuments = new Map(
    (options.previousIndex?.documents ?? []).map((document) => [
      document.indexedSkill.skill.id,
      document,
    ]),
  );
  let reusedDocumentCount = 0;
  let rebuiltDocumentCount = 0;
  const documents = index.skills.map((indexedSkill) => {
    const skillFingerprint = fingerprintIndexedSkill(indexedSkill);
    const previousDocument = previousDocuments.get(indexedSkill.skill.id);
    if (previousDocument?.skillFingerprint === skillFingerprint) {
      reusedDocumentCount += 1;
      return fromSkillSearchIndexDocument({
        ...previousDocument,
        indexedSkill,
        skillFingerprint,
      });
    }

    rebuiltDocumentCount += 1;
    return buildSearchDocument(
      indexedSkill,
      catalogBySkillId.get(indexedSkill.skill.id),
      skillFingerprint,
    );
  });
  const generatedAt = (options.now ?? new Date()).toISOString();
  const searchIndex: SkillSearchIndex = {
    schemaVersion: "skillrouter.search-index/v1",
    generatedAt,
    sourceRoot: index.sourceRoot,
    skillCount: documents.length,
    sourceIndexFingerprint: fingerprintLocalSkillIndex(index),
    fingerprintAlgorithm: "skillrouter.search-fingerprint/v1",
    averageDocumentLength: averageDocumentLength(documents),
    documentFrequencies: mapToRecord(computeDocumentFrequencies(documents)),
    documents: documents.map(toSkillSearchIndexDocument),
  };

  return {
    schemaVersion: "skillrouter.search-index-build/v1",
    generatedAt,
    searchIndex,
    reusedDocumentCount,
    rebuiltDocumentCount,
  };
}

export function checkSkillSearchIndexFreshness(
  sourceIndex: LocalSkillIndex,
  searchIndex: SkillSearchIndex,
  options: { now?: Date } = {},
): SkillSearchIndexFreshnessReport {
  const expectedSourceIndexFingerprint =
    fingerprintLocalSkillIndex(sourceIndex);
  const expectedSkillFingerprints = new Map(
    sourceIndex.skills.map((indexedSkill) => [
      indexedSkill.skill.id,
      fingerprintIndexedSkill(indexedSkill),
    ]),
  );
  const documentFingerprints = new Map(
    searchIndex.documents.map((document) => [
      document.indexedSkill.skill.id,
      document.skillFingerprint,
    ]),
  );
  const missingSkillIds = Array.from(expectedSkillFingerprints.keys()).filter(
    (skillId) => !documentFingerprints.has(skillId),
  );
  const staleSkillIds = Array.from(expectedSkillFingerprints.entries())
    .filter(
      ([skillId, expected]) => documentFingerprints.get(skillId) !== expected,
    )
    .map(([skillId]) => skillId)
    .filter((skillId) => !missingSkillIds.includes(skillId));
  const extraSkillIds = Array.from(documentFingerprints.keys()).filter(
    (skillId) => !expectedSkillFingerprints.has(skillId),
  );
  const reasons: string[] = [];

  if (!searchIndex.sourceIndexFingerprint) {
    reasons.push("Search index is missing a source index fingerprint.");
  } else if (
    searchIndex.sourceIndexFingerprint !== expectedSourceIndexFingerprint
  ) {
    reasons.push(
      "Search index source fingerprint differs from the source index.",
    );
  }
  if (searchIndex.skillCount !== sourceIndex.skills.length) {
    reasons.push("Search index skill count differs from the source index.");
  }
  if (missingSkillIds.length > 0) {
    reasons.push(`Missing ${missingSkillIds.length} skill document(s).`);
  }
  if (staleSkillIds.length > 0) {
    reasons.push(`Stale ${staleSkillIds.length} skill document(s).`);
  }
  if (extraSkillIds.length > 0) {
    reasons.push(`Extra ${extraSkillIds.length} skill document(s).`);
  }

  const fresh =
    reasons.length === 0 &&
    searchIndex.sourceIndexFingerprint === expectedSourceIndexFingerprint;

  return {
    schemaVersion: "skillrouter.search-index-freshness/v1",
    checkedAt: (options.now ?? new Date()).toISOString(),
    status: fresh ? "fresh" : "stale",
    sourceRoot: sourceIndex.sourceRoot,
    sourceSkillCount: sourceIndex.skills.length,
    searchIndexSkillCount: searchIndex.skillCount,
    expectedSourceIndexFingerprint,
    actualSourceIndexFingerprint: searchIndex.sourceIndexFingerprint,
    missingSkillIds,
    staleSkillIds,
    extraSkillIds,
    reasons: fresh ? ["Search index matches the source index."] : reasons,
  };
}

export function fingerprintLocalSkillIndex(index: LocalSkillIndex): string {
  return sha256Json({
    schemaVersion: index.schemaVersion,
    sourceRoot: index.sourceRoot,
    skills: index.skills
      .map((indexedSkill) => ({
        id: indexedSkill.skill.id,
        fingerprint: fingerprintIndexedSkill(indexedSkill),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function fingerprintIndexedSkill(indexedSkill: IndexedSkill): string {
  const { indexedAt: _skillIndexedAt, ...stableSkill } = indexedSkill.skill;
  return sha256Json({
    skill: stableSkill,
    skillFilePath: indexedSkill.skillFilePath,
    rootPath: indexedSkill.rootPath,
    body: indexedSkill.body,
  });
}

export function localIndexFromSkillSearchIndex(
  searchIndex: SkillSearchIndex,
): LocalSkillIndex {
  return {
    schemaVersion: "skillrouter.local-index/v1",
    generatedAt: searchIndex.generatedAt,
    sourceRoot: searchIndex.sourceRoot,
    skills: searchIndex.documents.map((document) => document.indexedSkill),
  };
}

export function searchSkillIndex(
  options: SearchSkillIndexOptions,
): SearchSkillsResult {
  const task = profileTask(options.query, {
    privacyMode: options.privacyMode,
  });
  const queryTokens = tokenizeText(options.query);
  const documents = options.searchIndex.documents
    .map(fromSkillSearchIndexDocument)
    .filter((document) => matchesFilters(document.catalogCard, options));
  const lexicalStats = computeLexicalStats(documents, queryTokens);
  const scored = documents.map((document) =>
    scoreDocument(document, task, queryTokens, lexicalStats),
  );
  const maxLexical = Math.max(0, ...scored.map((score) => score.rawLexical));

  const results = scored
    .map((score) => toSearchHit(score, task, queryTokens, maxLexical))
    .filter((hit) => hit.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.skill.id.localeCompare(right.skill.id),
    )
    .slice(0, options.maxResults ?? 20)
    .map((hit, index) => ({ ...hit, rank: index + 1 }));

  return {
    schemaVersion: "skillrouter.search/v1",
    generatedAt: new Date().toISOString(),
    query: options.query,
    task,
    totalSkillCount: options.searchIndex.skillCount,
    filteredSkillCount: documents.length,
    results,
  };
}

function buildSearchDocument(
  indexedSkill: IndexedSkill,
  catalogCard?: SkillCatalogCard,
  skillFingerprint = fingerprintIndexedSkill(indexedSkill),
): SearchDocument {
  if (!catalogCard) {
    throw new Error(`Missing catalog card for ${indexedSkill.skill.id}.`);
  }
  const text = buildSearchableText(indexedSkill, catalogCard);
  const tokenCounts = countTokens(text);
  const tokenSet = new Set(tokenCounts.keys());

  return {
    indexedSkill,
    catalogCard,
    text,
    tokenCounts,
    tokenSet,
    tokenCount: Array.from(tokenCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    ),
    skillFingerprint,
    skillVector: buildSkillVector(catalogCard, indexedSkill),
  };
}

function toSkillSearchIndexDocument(
  document: SearchDocument,
): SkillSearchIndexDocument {
  return {
    indexedSkill: document.indexedSkill,
    catalogCard: document.catalogCard,
    skillFingerprint: document.skillFingerprint,
    text: document.text,
    tokenCounts: mapToRecord(document.tokenCounts),
    tokenCount: document.tokenCount,
    skillVector: mapToRecord(document.skillVector),
  };
}

function fromSkillSearchIndexDocument(
  document: SkillSearchIndexDocument,
): SearchDocument {
  const tokenCounts = recordToMap(document.tokenCounts);

  return {
    indexedSkill: document.indexedSkill,
    catalogCard: document.catalogCard,
    text: document.text,
    tokenCounts,
    tokenSet: new Set(tokenCounts.keys()),
    tokenCount: document.tokenCount,
    skillFingerprint:
      document.skillFingerprint ??
      fingerprintIndexedSkill(document.indexedSkill),
    skillVector: recordToMap(document.skillVector),
  };
}

function matchesFilters(
  catalogCard: SkillCatalogCard,
  options: SearchFilters,
): boolean {
  if (options.localOnly && catalogCard.sourceType !== "local") return false;
  if (
    options.sourceTypes &&
    options.sourceTypes.length > 0 &&
    !options.sourceTypes.includes(catalogCard.sourceType as SourceType)
  ) {
    return false;
  }
  if (
    options.riskLevels &&
    options.riskLevels.length > 0 &&
    !options.riskLevels.includes(catalogCard.dimensions.riskLevel as RiskLevel)
  ) {
    return false;
  }
  if (!intersectsFilter(options.domains, catalogCard.dimensions.domains)) {
    return false;
  }
  if (!intersectsFilter(options.intents, catalogCard.dimensions.intents)) {
    return false;
  }
  if (
    !intersectsFilter(options.environments, catalogCard.dimensions.environments)
  ) {
    return false;
  }
  return true;
}

function intersectsFilter(
  filterValues: string[] | undefined,
  candidateValues: string[],
): boolean {
  if (!filterValues || filterValues.length === 0) return true;
  const candidateSet = new Set(candidateValues);
  return filterValues.some((value) => candidateSet.has(value));
}

function computeLexicalStats(
  documents: SearchDocument[],
  queryTokens: string[],
): LexicalStats {
  const tokens = new Map<string, { idf: number }>();
  const total = Math.max(documents.length, 1);
  const averageDocumentLength =
    documents.length > 0
      ? documents.reduce((sum, document) => sum + document.tokenCount, 0) /
        documents.length
      : 1;
  for (const token of queryTokens) {
    const documentFrequency = documents.filter((document) =>
      document.tokenSet.has(token),
    ).length;
    const idf = Math.log(
      1 + (total - documentFrequency + 0.5) / (documentFrequency + 0.5),
    );
    tokens.set(token, { idf });
  }
  return { averageDocumentLength, tokens };
}

function averageDocumentLength(documents: SearchDocument[]): number {
  if (documents.length === 0) return 0;
  return (
    documents.reduce((sum, document) => sum + document.tokenCount, 0) /
    documents.length
  );
}

function computeDocumentFrequencies(
  documents: SearchDocument[],
): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const document of documents) {
    for (const token of document.tokenSet) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }
  return frequencies;
}

function scoreDocument(
  document: SearchDocument,
  task: TaskProfile,
  queryTokens: string[],
  lexicalStats: LexicalStats,
): ScoredSearchDocument {
  return {
    document,
    rawLexical: scoreBm25Lite(document, queryTokens, lexicalStats),
    semantic: scoreSemantic(document, task, queryTokens),
    catalog: scoreCatalog(document.catalogCard, task),
    quality: scoreQuality(document.catalogCard),
    safety: scoreSafety(document.catalogCard, task),
  };
}

function scoreBm25Lite(
  document: SearchDocument,
  queryTokens: string[],
  stats: LexicalStats,
): number {
  if (queryTokens.length === 0) return 0;
  const k1 = 1.2;
  const b = 0.75;
  const averageLength = Math.max(stats.averageDocumentLength, 1);
  let score = 0;

  for (const token of queryTokens) {
    const termFrequency = document.tokenCounts.get(token) ?? 0;
    if (termFrequency === 0) continue;
    const idf = stats.tokens.get(token)?.idf ?? 0;
    const denominator =
      termFrequency + k1 * (1 - b + b * (document.tokenCount / averageLength));
    score += idf * ((termFrequency * (k1 + 1)) / denominator);
  }

  return score;
}

function scoreSemantic(
  document: SearchDocument,
  task: TaskProfile,
  queryTokens: string[],
): number {
  const queryVector = buildTaskVector(task, queryTokens);
  return Math.round(weightedCosine(queryVector, document.skillVector) * 100);
}

function scoreCatalog(card: SkillCatalogCard, task: TaskProfile): number {
  const scores: number[] = [];
  if (task.domain) {
    scores.push(card.dimensions.domains.includes(task.domain) ? 100 : 0);
  }
  if (task.intents.length > 0) {
    scores.push(
      percentage(
        task.intents.filter((intent) =>
          card.dimensions.intents.includes(intent),
        ).length,
        task.intents.length,
      ),
    );
  }
  if (task.fileTypes.length > 0) {
    scores.push(
      percentage(
        task.fileTypes.filter((input) =>
          card.dimensions.inputFormats.includes(input),
        ).length,
        task.fileTypes.length,
      ),
    );
  }
  if (task.outputRequirements.length > 0) {
    scores.push(
      percentage(
        task.outputRequirements.filter((output) =>
          card.dimensions.outputFormats.includes(output),
        ).length,
        task.outputRequirements.length,
      ),
    );
  }
  if (task.environments.length > 0) {
    scores.push(
      percentage(
        task.environments.filter((environment) =>
          card.dimensions.environments.includes(environment),
        ).length,
        task.environments.length,
      ),
    );
  }
  if (task.workflowStages.length > 0) {
    scores.push(
      percentage(
        task.workflowStages.filter((stage) =>
          card.dimensions.workflowStages.includes(stage),
        ).length,
        task.workflowStages.length,
      ),
    );
  }

  if (scores.length === 0) return 0;
  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
}

function scoreQuality(card: SkillCatalogCard): number {
  const signals = card.qualitySignals;
  let score = 50;
  if (signals.verifiedPublisher) score += 20;
  if ((signals.userRating ?? 0) >= 4.5) score += 15;
  if ((signals.installCount ?? 0) > 100) score += 10;
  if ((signals.stars ?? 0) > 100) score += 10;
  return Math.min(100, score);
}

function scoreSafety(card: SkillCatalogCard, task: TaskProfile): number {
  if (
    task.privacyMode === "strict" &&
    card.dimensions.environments.includes("network")
  ) {
    return 20;
  }
  if (card.dimensions.riskLevel === "low") return 100;
  if (card.dimensions.riskLevel === "medium") return 75;
  if (card.dimensions.riskLevel === "unknown") return 45;
  return 20;
}

function toSearchHit(
  scored: ScoredSearchDocument,
  task: TaskProfile,
  queryTokens: string[],
  maxLexical: number,
): SkillSearchHit {
  const lexical =
    maxLexical > 0 ? Math.round((scored.rawLexical / maxLexical) * 100) : 0;
  const hasRelevance = lexical > 0 || scored.semantic > 0 || scored.catalog > 0;
  const score = hasRelevance
    ? Math.round(
        lexical * 0.4 +
          scored.semantic * 0.25 +
          scored.catalog * 0.2 +
          scored.quality * 0.05 +
          scored.safety * 0.1,
      )
    : 0;
  const matchedKeywords = queryTokens.filter((token) =>
    scored.document.tokenSet.has(token),
  );
  const matchedDimensions = matchedDimensionValues(
    scored.document.catalogCard,
    task,
  );

  return {
    skill: scored.document.indexedSkill.skill,
    score,
    rank: 0,
    matchedKeywords,
    matchedDimensions,
    reasons: buildReasons(scored, task, matchedKeywords, matchedDimensions),
    scoreBreakdown: {
      lexical,
      semantic: scored.semantic,
      catalog: scored.catalog,
      quality: scored.quality,
      safety: scored.safety,
    },
  };
}

function matchedDimensionValues(
  card: SkillCatalogCard,
  task: TaskProfile,
): string[] {
  const matches = new Set<string>();
  if (task.domain && card.dimensions.domains.includes(task.domain)) {
    matches.add(`domain:${task.domain}`);
  }
  for (const intent of task.intents) {
    if (card.dimensions.intents.includes(intent))
      matches.add(`intent:${intent}`);
  }
  for (const input of task.fileTypes) {
    if (card.dimensions.inputFormats.includes(input))
      matches.add(`input:${input}`);
  }
  for (const output of task.outputRequirements) {
    if (card.dimensions.outputFormats.includes(output)) {
      matches.add(`output:${output}`);
    }
  }
  for (const environment of task.environments) {
    if (card.dimensions.environments.includes(environment)) {
      matches.add(`environment:${environment}`);
    }
  }
  for (const stage of task.workflowStages) {
    if (card.dimensions.workflowStages.includes(stage)) {
      matches.add(`workflow:${stage}`);
    }
  }
  return Array.from(matches);
}

function buildReasons(
  scored: ScoredSearchDocument,
  task: TaskProfile,
  matchedKeywords: string[],
  matchedDimensions: string[],
): string[] {
  const reasons: string[] = [];
  if (matchedKeywords.length > 0) {
    reasons.push(`Lexical match: ${matchedKeywords.slice(0, 8).join(", ")}.`);
  }
  if (matchedDimensions.length > 0) {
    reasons.push(
      `Dimension match: ${matchedDimensions.slice(0, 8).join(", ")}.`,
    );
  }
  if (scored.semantic > 0) {
    reasons.push(`Semantic vector fit is ${scored.semantic}/100.`);
  }
  if (
    task.privacyMode === "strict" &&
    scored.document.catalogCard.dimensions.environments.includes("network")
  ) {
    reasons.push("Strict privacy mode lowers network-dependent skill safety.");
  }
  if (reasons.length === 0) {
    reasons.push("Matched by broad metadata similarity.");
  }
  return reasons;
}

function buildTaskVector(
  task: TaskProfile,
  queryTokens: string[],
): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of queryTokens) addWeight(vector, token, 1);
  for (const intent of task.intents) addWeight(vector, intent, 3);
  if (task.domain) addWeight(vector, task.domain, 3);
  for (const fileType of task.fileTypes) addWeight(vector, fileType, 2);
  for (const output of task.outputRequirements) addWeight(vector, output, 2);
  for (const environment of task.environments)
    addWeight(vector, environment, 2);
  for (const stage of task.workflowStages) addWeight(vector, stage, 2);
  return vector;
}

function buildSkillVector(
  card: SkillCatalogCard,
  indexedSkill: IndexedSkill,
): Map<string, number> {
  const skill = indexedSkill.skill;
  const vector = new Map<string, number>();
  for (const token of tokenizeText(
    `${skill.name} ${skill.displayName ?? ""}`,
  )) {
    addWeight(vector, token, 2);
  }
  for (const token of tokenizeText(skill.description))
    addWeight(vector, token, 1);
  for (const value of card.dimensions.intents) addWeight(vector, value, 3);
  for (const value of card.dimensions.capabilities) addWeight(vector, value, 3);
  for (const value of card.dimensions.domains) addWeight(vector, value, 2.5);
  for (const value of card.dimensions.inputFormats) addWeight(vector, value, 2);
  for (const value of card.dimensions.outputFormats)
    addWeight(vector, value, 2);
  for (const value of card.dimensions.environments) addWeight(vector, value, 2);
  for (const value of card.dimensions.workflowStages)
    addWeight(vector, value, 2);
  for (const value of card.dimensions.languages) addWeight(vector, value, 1.5);
  return vector;
}

function weightedCosine(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const value of left.values()) leftMagnitude += value * value;
  for (const value of right.values()) rightMagnitude += value * value;
  for (const [key, leftValue] of left) {
    dotProduct += leftValue * (right.get(key) ?? 0);
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function addWeight(
  vector: Map<string, number>,
  key: string,
  weight: number,
): void {
  if (!key) return;
  vector.set(key, (vector.get(key) ?? 0) + weight);
}

function buildSearchableText(
  indexedSkill: IndexedSkill,
  catalogCard: SkillCatalogCard,
): string {
  const skill = indexedSkill.skill;
  return [
    skill.name,
    skill.displayName,
    skill.description,
    skill.readmeSummary,
    skill.tags.join(" "),
    skill.capabilities.join(" "),
    skill.intents.join(" "),
    skill.inputFormats.join(" "),
    skill.outputFormats.join(" "),
    skill.languages.join(" "),
    skill.locator,
    catalogCard.dimensions.domains.join(" "),
    catalogCard.dimensions.intents.join(" "),
    catalogCard.dimensions.capabilities.join(" "),
    catalogCard.dimensions.inputFormats.join(" "),
    catalogCard.dimensions.outputFormats.join(" "),
    catalogCard.dimensions.environments.join(" "),
    catalogCard.dimensions.workflowStages.join(" "),
    indexedSkill.body,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countTokens(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const normalized = text.toLowerCase();
  for (const match of normalized.matchAll(/[\p{L}\p{N}_+-]+/gu)) {
    const token = match[0].trim();
    if (token.length <= 1) continue;
    addCount(counts, token);
    if (/\p{Script=Han}/u.test(token)) {
      for (const gram of cjkNgrams(token)) addCount(counts, gram);
    }
  }
  return counts;
}

function addCount(counts: Map<string, number>, token: string): void {
  counts.set(token, (counts.get(token) ?? 0) + 1);
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    Array.from(map.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function recordToMap(record: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(record));
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cjkNgrams(text: string): string[] {
  const chars = Array.from(text);
  const grams: string[] = [];
  if (chars.length > 2) grams.push(text);
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(chars.slice(index, index + 2).join(""));
  }
  return grams;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
