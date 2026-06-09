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
    constraints: [],
    privacyMode: options.privacyMode ?? "balanced",
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
  return undefined;
}

function inferFileTypes(text: string): string[] {
  const matches =
    text.match(/\b(docx|pdf|pptx|xlsx|csv|ts|tsx|js|jsx|py|md)\b/gi) ?? [];
  return Array.from(new Set(matches.map((match) => match.toLowerCase())));
}

function inferOutputRequirements(text: string): string[] {
  const outputs = new Set<string>();
  if (/(ppt|slide|slides|presentation|幻灯片)/i.test(text)) outputs.add("pptx");
  if (/(pdf|报告)/i.test(text)) outputs.add("pdf");
  if (/(markdown|md)/i.test(text)) outputs.add("markdown");
  return Array.from(outputs);
}
