import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillSourceRegistry, SkillSourceRegistryEntry } from "./types.js";

export function defaultSourceRegistryPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, ".skillrouter", "sources.json");
}

export async function readSourceRegistry(
  registryPath = defaultSourceRegistryPath(),
): Promise<SkillSourceRegistry> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(registryPath, "utf8"),
    ) as SkillSourceRegistry;
    if (
      parsed.schemaVersion !== "skillrouter.sources/v1" ||
      !Array.isArray(parsed.sources)
    ) {
      throw new Error(`Unsupported source registry: ${registryPath}`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptySourceRegistry();
    }
    throw error;
  }
}

export async function writeSourceRegistry(
  registry: SkillSourceRegistry,
  registryPath = defaultSourceRegistryPath(),
): Promise<void> {
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(
    registryPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );
}

export async function addSourceRegistryEntry(
  entry: Omit<SkillSourceRegistryEntry, "addedAt" | "enabled"> & {
    addedAt?: string;
    enabled?: boolean;
  },
  registryPath = defaultSourceRegistryPath(),
): Promise<SkillSourceRegistry> {
  const now = entry.addedAt ?? new Date().toISOString();
  const registry = await readSourceRegistry(registryPath);
  const next: SkillSourceRegistry = {
    schemaVersion: "skillrouter.sources/v1",
    updatedAt: now,
    sources: [
      ...registry.sources.filter((source) => source.name !== entry.name),
      {
        name: entry.name,
        url: entry.url,
        mirrors: entry.mirrors,
        addedAt: now,
        enabled: entry.enabled ?? true,
      },
    ].sort((left, right) => left.name.localeCompare(right.name)),
  };
  await writeSourceRegistry(next, registryPath);
  return next;
}

export async function removeSourceRegistryEntry(
  name: string,
  registryPath = defaultSourceRegistryPath(),
): Promise<SkillSourceRegistry> {
  const registry = await readSourceRegistry(registryPath);
  const next: SkillSourceRegistry = {
    schemaVersion: "skillrouter.sources/v1",
    updatedAt: new Date().toISOString(),
    sources: registry.sources.filter((source) => source.name !== name),
  };
  await writeSourceRegistry(next, registryPath);
  return next;
}

export async function resolveSourceRegistryEntry(
  nameOrUrl: string,
  registryPath = defaultSourceRegistryPath(),
): Promise<SkillSourceRegistryEntry | undefined> {
  const registry = await readSourceRegistry(registryPath);
  return registry.sources.find((source) => source.name === nameOrUrl);
}

export async function resolveSourceUrls(
  nameOrUrl: string,
  registryPath = defaultSourceRegistryPath(),
): Promise<string[]> {
  const entry = await resolveSourceRegistryEntry(nameOrUrl, registryPath);
  if (!entry) return [nameOrUrl];
  if (!entry.enabled) {
    throw new Error(`Static source is disabled: ${entry.name}`);
  }
  return [entry.url, ...(entry.mirrors ?? [])];
}

function emptySourceRegistry(): SkillSourceRegistry {
  return {
    schemaVersion: "skillrouter.sources/v1",
    updatedAt: new Date(0).toISOString(),
    sources: [],
  };
}
