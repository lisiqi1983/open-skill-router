import { parse as parseYaml } from "yaml";
import type { ParsedSkillDocument } from "./types.js";

export interface ParseSkillMdOptions {
  fallbackName?: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseSkillMd(
  content: string,
  options: ParseSkillMdOptions = {},
): ParsedSkillDocument {
  const { frontmatter, body } = splitFrontmatter(content);
  const name =
    readString(frontmatter.name) ?? options.fallbackName ?? "unnamed-skill";
  const displayName =
    readString(frontmatter.display_name) ?? readString(frontmatter.displayName);
  const description =
    readString(frontmatter.description) ?? firstParagraph(body) ?? "";

  return {
    frontmatter,
    body: body.trim(),
    name,
    displayName,
    description,
    tags: readStringList(frontmatter.tags),
    capabilities: readStringList(frontmatter.capabilities),
    intents: readStringList(frontmatter.intents),
    inputFormats: readStringList(
      frontmatter.input_formats ?? frontmatter.inputFormats,
    ),
    outputFormats: readStringList(
      frontmatter.output_formats ?? frontmatter.outputFormats,
    ),
    languages: readStringList(frontmatter.languages),
  };
}

function splitFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const parsed = parseYaml(match[1] ?? "");
  const frontmatter = isRecord(parsed) ? parsed : {};

  return {
    frontmatter,
    body: content.slice(match[0].length),
  };
}

function firstParagraph(body: string): string | undefined {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines[0];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : undefined))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
