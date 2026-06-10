import type { SkillReference } from "@openskillrouter/skill-spec";
import type {
  SkillCatalog,
  SkillCatalogAnalysis,
  SkillCatalogAnalysisDimension,
  SkillCatalogCard,
  SkillCatalogCount,
  SkillCatalogDimensionAnalysis,
  SkillCatalogGap,
  SkillCatalogMatrixCell,
  SkillCatalogMatrixSlice,
  SkillCatalogSkillProfile,
} from "./types.js";

export interface AnalyzeSkillCatalogOptions {
  now?: Date;
  maxTopValues?: number;
  maxMatrixCells?: number;
}

interface DimensionDefinition {
  dimension: SkillCatalogAnalysisDimension;
  label: string;
}

const DIMENSIONS: DimensionDefinition[] = [
  { dimension: "domains", label: "Domains" },
  { dimension: "intents", label: "Intents" },
  { dimension: "capabilities", label: "Capabilities" },
  { dimension: "inputFormats", label: "Input formats" },
  { dimension: "outputFormats", label: "Output formats" },
  { dimension: "environments", label: "Environments" },
  { dimension: "workflowStages", label: "Workflow stages" },
  { dimension: "languages", label: "Languages" },
  { dimension: "riskLevel", label: "Risk level" },
  { dimension: "sourceType", label: "Source type" },
];

const GAP_DIMENSIONS: SkillCatalogAnalysisDimension[] = [
  "domains",
  "intents",
  "capabilities",
  "inputFormats",
  "outputFormats",
  "environments",
  "workflowStages",
];

const MATRIX_SLICES: Array<{
  name: string;
  rowDimension: SkillCatalogAnalysisDimension;
  columnDimension: SkillCatalogAnalysisDimension;
}> = [
  {
    name: "domain_by_output",
    rowDimension: "domains",
    columnDimension: "outputFormats",
  },
  {
    name: "domain_by_workflow",
    rowDimension: "domains",
    columnDimension: "workflowStages",
  },
  {
    name: "input_by_output",
    rowDimension: "inputFormats",
    columnDimension: "outputFormats",
  },
  {
    name: "environment_by_risk",
    rowDimension: "environments",
    columnDimension: "riskLevel",
  },
];

export function analyzeSkillCatalog(
  catalog: SkillCatalog,
  options: AnalyzeSkillCatalogOptions = {},
): SkillCatalogAnalysis {
  const maxTopValues = options.maxTopValues ?? 10;
  const maxMatrixCells = options.maxMatrixCells ?? 50;
  const dimensions = DIMENSIONS.map((definition) =>
    analyzeDimension(catalog.cards, definition.dimension, maxTopValues),
  );

  return {
    schemaVersion: "skillrouter.catalog-analysis/v1",
    generatedAt: (options.now ?? new Date()).toISOString(),
    sourceRoot: catalog.sourceRoot,
    skillCount: catalog.skillCount,
    dimensions,
    matrixSlices: MATRIX_SLICES.map((slice) =>
      buildMatrixSlice(catalog.cards, slice, maxMatrixCells),
    ),
    skillProfiles: catalog.cards.map(toSkillProfile),
    gaps: buildGaps(catalog.cards, dimensions),
  };
}

export function renderSkillCatalogAnalysisMarkdown(
  analysis: SkillCatalogAnalysis,
): string {
  const lines: string[] = [
    "# Skill Catalog Analysis",
    "",
    `Generated: ${analysis.generatedAt}`,
    `Source root: ${analysis.sourceRoot}`,
    `Skills: ${analysis.skillCount}`,
    "",
    "## Dimension Coverage",
    "",
    "| Dimension | Coverage | Distinct values | Top values |",
    "| --- | ---: | ---: | --- |",
  ];

  for (const dimension of analysis.dimensions) {
    lines.push(
      `| ${dimension.dimension} | ${dimension.coveragePercent}% (${dimension.coveredSkillCount}/${dimension.totalSkillCount}) | ${dimension.distinctValueCount} | ${formatCounts(dimension.topValues, 5)} |`,
    );
  }

  lines.push("", "## Tensor Slices", "");
  for (const slice of analysis.matrixSlices) {
    lines.push(
      `### ${slice.name} (${slice.rowDimension} x ${slice.columnDimension})`,
      "",
    );
    if (slice.cells.length === 0) {
      lines.push("No populated cells.", "");
      continue;
    }
    lines.push("| Row | Column | Skills |", "| --- | --- | ---: |");
    for (const cell of slice.cells.slice(0, 12)) {
      lines.push(`| ${cell.rowValue} | ${cell.columnValue} | ${cell.count} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Skill Profiles",
    "",
    "| Skill | Domains | Intents | Outputs | Workflow | Environment | Risk |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const profile of analysis.skillProfiles) {
    lines.push(
      `| ${profile.displayName ?? profile.name} | ${formatValues(profile.primaryDimensions.domains)} | ${formatValues(profile.primaryDimensions.intents)} | ${formatValues(profile.primaryDimensions.outputFormats)} | ${formatValues(profile.primaryDimensions.workflowStages)} | ${formatValues(profile.primaryDimensions.environments)} | ${profile.riskLevel} |`,
    );
  }

  lines.push("", "## Gaps", "");
  if (analysis.gaps.length === 0) {
    lines.push("No catalog gaps detected.");
  } else {
    for (const gap of analysis.gaps.slice(0, 30)) {
      lines.push(
        `- ${gap.severity}: ${gap.message} (${gap.skillIds.length} skill(s))`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function analyzeDimension(
  cards: SkillCatalogCard[],
  dimension: SkillCatalogAnalysisDimension,
  maxTopValues: number,
): SkillCatalogDimensionAnalysis {
  const counts = countValues(
    cards.flatMap((card) => getDimensionValues(card, dimension)),
  );
  const unclassifiedSkillIds = cards
    .filter((card) => getDimensionValues(card, dimension).length === 0)
    .map((card) => card.skillId);
  const coveredSkillCount = cards.length - unclassifiedSkillIds.length;

  return {
    dimension,
    coveredSkillCount,
    totalSkillCount: cards.length,
    coveragePercent: percentage(coveredSkillCount, cards.length),
    distinctValueCount: counts.length,
    topValues: counts.slice(0, maxTopValues),
    singletonValues: counts.filter((count) => count.count === 1),
    unclassifiedSkillIds,
  };
}

function buildMatrixSlice(
  cards: SkillCatalogCard[],
  slice: {
    name: string;
    rowDimension: SkillCatalogAnalysisDimension;
    columnDimension: SkillCatalogAnalysisDimension;
  },
  maxMatrixCells: number,
): SkillCatalogMatrixSlice {
  const cells = new Map<string, SkillCatalogMatrixCell>();

  for (const card of cards) {
    const rowValues = getDimensionValues(card, slice.rowDimension);
    const columnValues = getDimensionValues(card, slice.columnDimension);
    for (const rowValue of rowValues) {
      for (const columnValue of columnValues) {
        const key = `${rowValue}\u0000${columnValue}`;
        const existing = cells.get(key);
        if (existing) {
          existing.count += 1;
          existing.skillIds.push(card.skillId);
        } else {
          cells.set(key, {
            rowValue,
            columnValue,
            count: 1,
            skillIds: [card.skillId],
          });
        }
      }
    }
  }

  return {
    name: slice.name,
    rowDimension: slice.rowDimension,
    columnDimension: slice.columnDimension,
    cells: Array.from(cells.values())
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.rowValue.localeCompare(right.rowValue) ||
          left.columnValue.localeCompare(right.columnValue),
      )
      .slice(0, maxMatrixCells),
  };
}

function toSkillProfile(card: SkillCatalogCard): SkillCatalogSkillProfile {
  const primaryDimensions = {
    domains: topValues(card.dimensions.domains),
    intents: topValues(card.dimensions.intents),
    capabilities: topValues(card.dimensions.capabilities),
    inputFormats: topValues(card.dimensions.inputFormats),
    outputFormats: topValues(card.dimensions.outputFormats),
    environments: topValues(card.dimensions.environments),
    workflowStages: topValues(card.dimensions.workflowStages),
    languages: topValues(card.dimensions.languages),
  };

  return {
    skillId: card.skillId,
    name: card.name,
    displayName: card.displayName,
    sourceType: card.sourceType,
    riskLevel: card.dimensions.riskLevel,
    qualityScore: scoreQuality(card.qualitySignals),
    primaryDimensions,
    vectorKey: [
      `domain=${primaryDimensions.domains.join("+") || "none"}`,
      `intent=${primaryDimensions.intents.join("+") || "none"}`,
      `output=${primaryDimensions.outputFormats.join("+") || "none"}`,
      `workflow=${primaryDimensions.workflowStages.join("+") || "none"}`,
      `env=${primaryDimensions.environments.join("+") || "none"}`,
      `risk=${card.dimensions.riskLevel}`,
    ].join("|"),
  };
}

function buildGaps(
  cards: SkillCatalogCard[],
  dimensions: SkillCatalogDimensionAnalysis[],
): SkillCatalogGap[] {
  const gaps: SkillCatalogGap[] = [];
  const byDimension = new Map(
    dimensions.map((dimension) => [dimension.dimension, dimension]),
  );

  for (const dimensionName of GAP_DIMENSIONS) {
    const dimension = byDimension.get(dimensionName);
    if (!dimension) continue;
    if (dimension.unclassifiedSkillIds.length > 0) {
      gaps.push({
        type: "missing_dimension",
        severity: "warning",
        dimension: dimensionName,
        message: `${dimension.unclassifiedSkillIds.length} skill(s) have no ${dimensionName} classification.`,
        skillIds: dimension.unclassifiedSkillIds,
      });
    }
    for (const singleton of dimension.singletonValues.slice(0, 8)) {
      gaps.push({
        type: "sparse_dimension",
        severity: "info",
        dimension: dimensionName,
        value: singleton.value,
        message: `${dimensionName} value "${singleton.value}" appears in only one skill.`,
        skillIds: cards
          .filter((card) =>
            getDimensionValues(card, dimensionName).includes(singleton.value),
          )
          .map((card) => card.skillId),
      });
    }
  }

  const unknownRiskSkillIds = cards
    .filter((card) => card.dimensions.riskLevel === "unknown")
    .map((card) => card.skillId);
  if (unknownRiskSkillIds.length > 0) {
    gaps.push({
      type: "unknown_risk",
      severity: "warning",
      dimension: "riskLevel",
      value: "unknown",
      message: `${unknownRiskSkillIds.length} skill(s) need a risk scan before confident routing.`,
      skillIds: unknownRiskSkillIds,
    });
  }

  const highRiskSkillIds = cards
    .filter((card) => card.dimensions.riskLevel === "high")
    .map((card) => card.skillId);
  if (highRiskSkillIds.length > 0) {
    gaps.push({
      type: "high_risk",
      severity: "warning",
      dimension: "riskLevel",
      value: "high",
      message: `${highRiskSkillIds.length} high-risk skill(s) should require explicit inspection before install/use.`,
      skillIds: highRiskSkillIds,
    });
  }

  return gaps;
}

function getDimensionValues(
  card: SkillCatalogCard,
  dimension: SkillCatalogAnalysisDimension,
): string[] {
  if (dimension === "riskLevel") return [card.dimensions.riskLevel];
  if (dimension === "sourceType") return [card.sourceType];
  return card.dimensions[dimension];
}

function countValues(values: string[]): SkillCatalogCount[] {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    );
}

function topValues(values: string[]): string[] {
  return values.slice(0, 5);
}

function scoreQuality(
  qualitySignals: SkillReference["qualitySignals"],
): number {
  let score = 50;
  if (qualitySignals.verifiedPublisher) score += 20;
  if ((qualitySignals.userRating ?? 0) >= 4.5) score += 15;
  if ((qualitySignals.installCount ?? 0) > 100) score += 10;
  if ((qualitySignals.stars ?? 0) > 100) score += 10;
  return Math.min(100, score);
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function formatCounts(counts: SkillCatalogCount[], max: number): string {
  return (
    counts
      .slice(0, max)
      .map((count) => `${count.value}=${count.count}`)
      .join(", ") || "none"
  );
}

function formatValues(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
