import { promises as fs } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  SourceManifest,
  SourceManifestSkill,
  SourceManifestSource,
} from "./types.js";

export async function readSourceManifest(
  manifestPath: string,
): Promise<SourceManifest> {
  return parseSourceManifest(await fs.readFile(manifestPath, "utf8"), {
    sourceName: manifestPath,
  });
}

export function parseSourceManifest(
  content: string,
  options: { sourceName?: string } = {},
): SourceManifest {
  const parsed = parseYaml(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(
      `Source manifest ${options.sourceName ?? ""} must be a YAML object.`,
    );
  }
  if (parsed.schema_version !== "skillrouter.source/v1") {
    throw new Error(
      `Unsupported source manifest schema: ${String(parsed.schema_version)}.`,
    );
  }
  if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) {
    throw new Error("Source manifest must include a non-empty name.");
  }

  const sources = optionalArray(parsed.sources, "sources").map(
    (source, index) => parseManifestSource(source, `sources[${index}]`),
  );
  const skills = optionalArray(parsed.skills, "skills").map((skill, index) =>
    parseManifestSkill(skill, `skills[${index}]`),
  );

  return {
    schema_version: "skillrouter.source/v1",
    name: parsed.name,
    description: optionalString(parsed.description, "description"),
    maintainer: optionalString(parsed.maintainer, "maintainer"),
    updated_at: optionalString(parsed.updated_at, "updated_at"),
    sources,
    skills,
  };
}

function parseManifestSource(
  value: unknown,
  path: string,
): SourceManifestSource {
  if (!isRecord(value)) {
    throw new Error(`Source manifest ${path} must be an object.`);
  }
  if (value.type === "local") {
    return {
      type: "local",
      path: requiredString(value.path, `${path}.path`),
      include: optionalStringArray(value.include, `${path}.include`),
      tags: optionalStringArray(value.tags, `${path}.tags`),
      notes: optionalString(value.notes, `${path}.notes`),
    };
  }
  if (value.type === "github") {
    return {
      type: "github",
      repo: requiredString(value.repo, `${path}.repo`),
      ref: optionalString(value.ref, `${path}.ref`),
      include: optionalStringArray(value.include, `${path}.include`),
      tags: optionalStringArray(value.tags, `${path}.tags`),
      notes: optionalString(value.notes, `${path}.notes`),
    };
  }

  throw new Error(`Source manifest ${path}.type must be local or github.`);
}

function parseManifestSkill(value: unknown, path: string): SourceManifestSkill {
  if (!isRecord(value)) {
    throw new Error(`Source manifest ${path} must be an object.`);
  }
  const source = value.source;
  if (!isRecord(source)) {
    throw new Error(`Source manifest ${path}.source must be an object.`);
  }

  if (source.type === "local") {
    return {
      id: optionalString(value.id, `${path}.id`),
      source: {
        type: "local",
        path: requiredString(source.path, `${path}.source.path`),
      },
      tags: optionalStringArray(value.tags, `${path}.tags`),
      notes: optionalString(value.notes, `${path}.notes`),
    };
  }

  if (source.type === "github") {
    return {
      id: optionalString(value.id, `${path}.id`),
      source: {
        type: "github",
        repo: requiredString(source.repo, `${path}.source.repo`),
        path: requiredString(source.path, `${path}.source.path`),
        ref: optionalString(source.ref, `${path}.source.ref`),
      },
      tags: optionalStringArray(value.tags, `${path}.tags`),
      notes: optionalString(value.notes, `${path}.notes`),
    };
  }

  throw new Error(
    `Source manifest ${path}.source.type must be local or github.`,
  );
}

function optionalArray(value: unknown, path: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Source manifest ${path} must be an array.`);
  }
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Source manifest ${path} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Source manifest ${path} must be a string.`);
  }
  return value;
}

function optionalStringArray(
  value: unknown,
  path: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Source manifest ${path} must be an array of strings.`);
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw new Error(`Source manifest ${path}[${index}] must be a string.`);
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
