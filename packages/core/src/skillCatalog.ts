import type { SkillReference } from "@openskillrouter/skill-spec";
import type {
  IndexedSkill,
  LocalSkillIndex,
  SkillCatalog,
  SkillCatalogCard,
  SkillCatalogCount,
  SkillCatalogDimensions,
  SkillCatalogSummary,
} from "./types.js";

export interface BuildSkillCatalogOptions {
  now?: Date;
}

export function buildSkillCatalog(
  index: LocalSkillIndex,
  options: BuildSkillCatalogOptions = {},
): SkillCatalog {
  const cards = index.skills.map(toCatalogCard);

  return {
    schemaVersion: "skillrouter.catalog/v1",
    generatedAt: (options.now ?? new Date()).toISOString(),
    sourceRoot: index.sourceRoot,
    skillCount: cards.length,
    cards,
    summary: summarizeCatalog(cards),
  };
}

function toCatalogCard(indexedSkill: IndexedSkill): SkillCatalogCard {
  const dimensions = inferCatalogDimensions(indexedSkill);
  const skill = indexedSkill.skill;

  return {
    skillId: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    locator: skill.locator,
    sourceType: skill.sourceType,
    sourceUrl: skill.sourceUrl,
    dimensions,
    qualitySignals: skill.qualitySignals,
    indexedAt: skill.indexedAt,
    updatedAt: skill.updatedAt,
    contentHash: skill.contentHash,
  };
}

function inferCatalogDimensions(
  indexedSkill: IndexedSkill,
): SkillCatalogDimensions {
  const skill = indexedSkill.skill;
  const searchableText = buildSearchableText(indexedSkill);

  return {
    intents: uniqueSorted([
      ...skill.intents,
      ...inferValues(searchableText, INTENT_RULES),
    ]),
    domains: uniqueSorted([
      ...skill.tags,
      ...inferValues(searchableText, DOMAIN_RULES),
    ]),
    capabilities: uniqueSorted(skill.capabilities),
    inputFormats: uniqueSorted(skill.inputFormats),
    outputFormats: uniqueSorted(skill.outputFormats),
    environments: uniqueSorted([
      ...inferEnvironments(skill),
      ...inferValues(searchableText, ENVIRONMENT_RULES),
    ]),
    workflowStages: uniqueSorted(inferValues(searchableText, WORKFLOW_RULES)),
    languages: uniqueSorted(skill.languages),
    riskLevel: skill.riskLevel,
  };
}

function summarizeCatalog(cards: SkillCatalogCard[]): SkillCatalogSummary {
  return {
    sourceTypes: countValues(cards.map((card) => card.sourceType)),
    domains: countValues(cards.flatMap((card) => card.dimensions.domains)),
    intents: countValues(cards.flatMap((card) => card.dimensions.intents)),
    capabilities: countValues(
      cards.flatMap((card) => card.dimensions.capabilities),
    ),
    inputFormats: countValues(
      cards.flatMap((card) => card.dimensions.inputFormats),
    ),
    outputFormats: countValues(
      cards.flatMap((card) => card.dimensions.outputFormats),
    ),
    environments: countValues(
      cards.flatMap((card) => card.dimensions.environments),
    ),
    workflowStages: countValues(
      cards.flatMap((card) => card.dimensions.workflowStages),
    ),
    languages: countValues(cards.flatMap((card) => card.dimensions.languages)),
    riskLevels: countValues(cards.map((card) => card.dimensions.riskLevel)),
  };
}

function buildSearchableText(indexedSkill: IndexedSkill): string {
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
    indexedSkill.body,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferValues(
  text: string,
  rules: Array<{ value: string; pattern: RegExp }>,
): string[] {
  return rules
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.value);
}

function inferEnvironments(skill: SkillReference): string[] {
  const environments = new Set<string>();
  if (skill.sourceType === "github") environments.add("github");
  if (skill.sourceType === "local") environments.add("local_filesystem");
  if (skill.permissions.filesystem !== "none") {
    environments.add("filesystem");
  }
  if (skill.permissions.network.access !== "none") {
    environments.add("network");
  }
  if (skill.permissions.runtime.python !== "none") environments.add("python");
  if (skill.permissions.runtime.node !== "none") environments.add("node");
  if (skill.permissions.runtime.shell !== "none") environments.add("shell");
  if (skill.permissions.secrets !== "none") environments.add("secrets");
  return Array.from(environments);
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

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

const INTENT_RULES = [
  {
    value: "skill_discovery",
    pattern: /\b(skill|install|recommend|router)\b|技能|安装|推荐/,
  },
  {
    value: "code_review",
    pattern: /\b(code|review|bug|typescript|python)\b|代码|审查|漏洞/,
  },
  {
    value: "document_authoring",
    pattern: /\b(docx|document|word|writing)\b|文档|写作/,
  },
  { value: "report_generation", pattern: /\b(report|pdf)\b|报告/ },
  {
    value: "presentation_generation",
    pattern: /\b(ppt|pptx|slide|presentation)\b|幻灯片|演示|汇报/,
  },
  {
    value: "data_analysis",
    pattern: /\b(data|analytics|dashboard|kpi|metric)\b|数据|指标|看板/,
  },
  {
    value: "media_generation",
    pattern: /\b(image|video|audio|tts|voice)\b|图片|视频|音频|语音/,
  },
  {
    value: "automation",
    pattern: /\b(browser|chrome|github|workflow|automation)\b|浏览器|自动化/,
  },
  {
    value: "deployment",
    pattern: /\b(deploy|release|ci|docker|kubernetes)\b|部署|发布/,
  },
];

const DOMAIN_RULES = [
  {
    value: "software",
    pattern: /\b(code|software|typescript|javascript|python|debug)\b|代码|软件/,
  },
  {
    value: "presentation",
    pattern: /\b(ppt|pptx|slide|presentation)\b|幻灯片|演示|汇报/,
  },
  { value: "patent", pattern: /\b(patent)\b|专利|交底书|新颖性|创造性/ },
  { value: "document", pattern: /\b(docx|document|word|pdf)\b|文档|报告/ },
  {
    value: "data",
    pattern:
      /\b(data|analytics|dashboard|kpi|metric|spreadsheet)\b|数据|表格|指标/,
  },
  { value: "image", pattern: /\b(image|photo|illustration)\b|图片|图像/ },
  { value: "video", pattern: /\b(video|remotion|heygen)\b|视频/ },
  { value: "audio", pattern: /\b(audio|tts|voice|sound)\b|音频|语音/ },
  { value: "github", pattern: /\b(github|pull request|pr|issue)\b/ },
  { value: "web", pattern: /\b(browser|chrome|web|website)\b|浏览器|网页/ },
  {
    value: "hardware",
    pattern: /\b(can|pcb|eda|hardware|nvidia|gpu)\b|硬件|电路|显卡/,
  },
  { value: "finance", pattern: /\b(finance|trading|stock)\b|交易|股票|证券/ },
  {
    value: "local_ai",
    pattern: /\b(local model|comfyui|chattts|qwen|stable audio)\b|本地模型/,
  },
];

const ENVIRONMENT_RULES = [
  { value: "mcp", pattern: /\bmcp\b/ },
  { value: "browser", pattern: /\bbrowser\b|浏览器/ },
  { value: "chrome", pattern: /\bchrome\b/ },
  { value: "github", pattern: /\bgithub\b/ },
  { value: "api", pattern: /\bapi\b/ },
  { value: "windows", pattern: /\bwindows\b/ },
  { value: "gpu", pattern: /\b(gpu|cuda|nvidia)\b|显卡/ },
  { value: "database", pattern: /\b(postgres|database|sql)\b|数据库/ },
  {
    value: "local_model",
    pattern: /\b(comfyui|chattts|qwen|local model)\b|本地模型/,
  },
];

const WORKFLOW_RULES = [
  {
    value: "discover",
    pattern: /\b(discover|recommend|find|search)\b|发现|推荐|寻找/,
  },
  { value: "plan", pattern: /\b(plan|design|architecture)\b|规划|设计|架构/ },
  { value: "research", pattern: /\b(research|analyze|analysis)\b|调研|分析/ },
  {
    value: "author",
    pattern:
      /\b(write|draft|author|generate|create|build|builder|prepare)\b|撰写|生成|起草/,
  },
  { value: "edit", pattern: /\b(edit|revise|polish)\b|编辑|润色|修改/ },
  {
    value: "verify",
    pattern: /\b(test|verify|qa|review|check)\b|测试|验证|审查/,
  },
  { value: "publish", pattern: /\b(publish|release|export)\b|发布|导出/ },
  { value: "deploy", pattern: /\b(deploy|serve|host)\b|部署|托管/ },
  { value: "operate", pattern: /\b(update|monitor|maintain)\b|更新|监控|维护/ },
];
