import type { TaskProfile } from "./types.js";
import { tokenizeText } from "./tokenize.js";

export interface ProfileTaskOptions {
  privacyMode?: TaskProfile["privacyMode"];
  userAgentHost?: TaskProfile["userAgentHost"];
}

export function profileTask(
  taskText: string,
  options: ProfileTaskOptions = {},
): TaskProfile {
  const keywords = tokenizeText(taskText);
  const language = detectLanguage(taskText);

  return {
    taskText,
    language,
    userAgentHost: options.userAgentHost,
    intents: inferIntents(taskText),
    keywords,
    domain: inferDomain(taskText),
    fileTypes: inferFileTypes(taskText),
    outputRequirements: inferOutputRequirements(taskText),
    environments: inferEnvironments(taskText),
    workflowStages: inferWorkflowStages(taskText),
    constraints: inferConstraints(taskText),
    privacyMode: options.privacyMode ?? "balanced",
    allowNetwork: inferAllowNetwork(taskText, options.privacyMode),
  };
}

function detectLanguage(text: string): TaskProfile["language"] {
  const hasCjk = /\p{Script=Han}/u.test(text);
  const hasLatin = /[A-Za-z]/.test(text);

  if (hasCjk && hasLatin) return "mixed";
  if (hasCjk) return "zh";
  if (hasLatin) return "en";
  return "unknown";
}

function inferIntents(text: string): string[] {
  const normalized = text.toLowerCase();
  const intents = new Set<string>();

  if (/(recommend|find|install|skill|推荐|寻找|安装|技能)/i.test(text))
    intents.add("skill_discovery");
  if (/(ppt|slide|slides|presentation|演示|幻灯片|汇报)/i.test(text))
    intents.add("presentation_generation");
  if (/(patent|专利|交底书|授权|新颖性|创造性)/i.test(text))
    intents.add("patent_analysis");
  if (/(review|code|bug|代码|审查|漏洞)/i.test(text))
    intents.add("code_review");
  if (/(data|analytics|dashboard|kpi|metric|数据|指标|看板)/i.test(text))
    intents.add("data_analysis");
  if (/(image|photo|图片|图像)/i.test(text)) intents.add("image_generation");
  if (/(video|视频)/i.test(text)) intents.add("video_generation");
  if (/(audio|tts|voice|音频|语音)/i.test(text))
    intents.add("audio_generation");
  if (/(deploy|release|ci|部署|发布)/i.test(text)) intents.add("deployment");
  if (/(pdf|report|报告)/i.test(text)) intents.add("report_generation");
  if (normalized.includes("update") || text.includes("更新"))
    intents.add("update");

  return Array.from(intents);
}

function inferDomain(text: string): string | undefined {
  if (/(patent|专利|交底书|授权|新颖性|创造性)/i.test(text)) return "patent";
  if (/(ppt|slide|slides|presentation|演示|幻灯片|汇报)/i.test(text))
    return "presentation";
  if (/(code|代码|typescript|python|bug)/i.test(text)) return "software";
  if (/(data|analytics|dashboard|kpi|metric|数据|指标|看板)/i.test(text))
    return "data";
  if (/(github|pull request|\bpr\b|issue)/i.test(text)) return "github";
  if (/(browser|chrome|web|网页|浏览器)/i.test(text)) return "web";
  return undefined;
}

function inferFileTypes(text: string): string[] {
  const matches =
    text.match(
      /\b(docx|pdf|pptx|xlsx|csv|ts|tsx|js|jsx|py|md|typescript|javascript|python|markdown)\b/gi,
    ) ?? [];
  const normalized = matches.map((match) => fileTypeAlias(match));
  return Array.from(new Set(normalized));
}

function fileTypeAlias(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "typescript") return "ts";
  if (normalized === "javascript") return "js";
  if (normalized === "python") return "py";
  if (normalized === "markdown") return "markdown";
  return normalized;
}

function inferEnvironments(text: string): string[] {
  const environments = new Set<string>();
  if (/(github|pull request|\bpr\b|issue)/i.test(text))
    environments.add("github");
  if (/(browser|浏览器)/i.test(text)) environments.add("browser");
  if (/chrome/i.test(text)) environments.add("chrome");
  if (/\bapi\b/i.test(text)) environments.add("api");
  if (/(gpu|cuda|nvidia|显卡)/i.test(text)) environments.add("gpu");
  if (/(windows|win32)/i.test(text)) environments.add("windows");
  if (/(local|offline|本地|离线|不要联网|不联网)/i.test(text))
    environments.add("local_filesystem");
  return Array.from(environments);
}

function inferOutputRequirements(text: string): string[] {
  const outputs = new Set<string>();
  if (/(ppt|slide|slides|presentation|幻灯片)/i.test(text)) outputs.add("pptx");
  if (/(pdf|报告)/i.test(text)) outputs.add("pdf");
  if (/(markdown|md)/i.test(text)) outputs.add("markdown");
  return Array.from(outputs);
}

function inferWorkflowStages(text: string): string[] {
  const stages = new Set<string>();
  if (/(recommend|find|search|推荐|寻找|发现)/i.test(text))
    stages.add("discover");
  if (/(plan|design|architecture|规划|设计|架构)/i.test(text))
    stages.add("plan");
  if (/(research|analyze|analysis|调研|分析)/i.test(text))
    stages.add("research");
  if (/(write|draft|generate|create|撰写|生成|起草)/i.test(text))
    stages.add("author");
  if (/(edit|revise|polish|编辑|润色|修改)/i.test(text)) stages.add("edit");
  if (/(test|verify|qa|review|check|测试|验证|审查)/i.test(text))
    stages.add("verify");
  if (/(publish|release|export|发布|导出)/i.test(text)) stages.add("publish");
  if (/(deploy|serve|host|部署|托管)/i.test(text)) stages.add("deploy");
  if (/(update|monitor|maintain|更新|监控|维护)/i.test(text))
    stages.add("operate");
  return Array.from(stages);
}

function inferConstraints(text: string): string[] {
  const constraints = new Set<string>();
  if (/(local|offline|本地|离线|不要联网|不联网)/i.test(text))
    constraints.add("local_only");
  if (/(no script|不要执行脚本|不执行脚本)/i.test(text))
    constraints.add("no_scripts");
  return Array.from(constraints);
}

function inferAllowNetwork(
  text: string,
  privacyMode?: TaskProfile["privacyMode"],
): boolean | undefined {
  if (privacyMode === "strict") return false;
  if (privacyMode === "cloud") return true;
  if (/(不要联网|不联网|offline|离线)/i.test(text)) return false;
  if (/(联网|online|api|github|browser|chrome)/i.test(text)) return true;
  return undefined;
}
