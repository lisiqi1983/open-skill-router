#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const execFileAsync = promisify(execFile);
const gunzipAsync = promisify(gunzip);

const repoRoot = process.cwd();
const releaseRoot = path.resolve(
  process.env.SKILLROUTER_RELEASE_DIR ?? path.join("dist", "release"),
);
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const indexDir = path.join(releaseRoot, "public", "open-skill-router", "index");
const releaseManifestPath = path.join(releaseRoot, "release-manifest.json");
const checksumsPath = path.join(releaseRoot, "checksums.sha256");
const archivePath = path.join(
  releaseRoot,
  "open-skill-router-static-index.tar.gz",
);

await assertFile(path.join(indexDir, "index.json"));
await assertFile(path.join(indexDir, "skills.jsonl"));
await assertFile(path.join(indexDir, "skills.jsonl.sha256"));
await assertFile(releaseManifestPath);
await assertFile(checksumsPath);
await assertFile(archivePath);

const releaseManifest = JSON.parse(
  await fs.readFile(releaseManifestPath, "utf8"),
);
if (releaseManifest.schemaVersion !== "skillrouter.release/v1") {
  throw new Error("Invalid release manifest schema.");
}
if (releaseManifest.staticIndex.skillCount < 1) {
  throw new Error("Release bundle should contain at least one skill.");
}
if (!releaseManifest.staticIndex.skillsSha256?.startsWith("sha256:")) {
  throw new Error("Release manifest is missing static index checksum.");
}

await verifyChecksums();
await verifyArchive();
await verifyStaticSourceHealth();

console.log("Smoke M6 release bundle passed.");

async function assertFile(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`Expected file: ${filePath}`);
}

async function verifyChecksums() {
  const lines = (await fs.readFile(checksumsPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set();

  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum line: ${line}`);
    const [, expected, relativePath] = match;
    const filePath = path.join(releaseRoot, relativePath);
    const actual = await sha256File(filePath);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${relativePath}.`);
    }
    seen.add(relativePath);
  }

  for (const required of [
    "release-manifest.json",
    "open-skill-router-static-index.tar.gz",
    "public/open-skill-router/index/index.json",
    "public/open-skill-router/index/skills.jsonl",
    "public/open-skill-router/index/skills.jsonl.sha256",
  ]) {
    if (!seen.has(required)) {
      throw new Error(`checksums.sha256 is missing ${required}.`);
    }
  }
}

async function verifyArchive() {
  const archive = await gunzipAsync(await fs.readFile(archivePath));
  const names = readTarNames(archive);
  for (const required of [
    "open-skill-router/index/index.json",
    "open-skill-router/index/skills.jsonl",
    "open-skill-router/index/skills.jsonl.sha256",
  ]) {
    if (!names.includes(required)) {
      throw new Error(`Release archive is missing ${required}.`);
    }
  }
}

async function verifyStaticSourceHealth() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "source", "health", indexDir, "--json"],
    {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const report = JSON.parse(stdout);
  if (report.checks?.[0]?.ok !== true) {
    throw new Error(`Static source health failed: ${stdout}`);
  }
}

function readTarNames(buffer) {
  const names = [];
  let offset = 0;
  while (offset + 512 <= buffer.byteLength) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readNullTerminated(header, 0, 100);
    const sizeText = readNullTerminated(header, 124, 12).trim();
    const size = parseInt(sizeText || "0", 8);
    names.push(name);
    offset += 512 + size + ((512 - (size % 512)) % 512);
  }
  return names;
}

function readNullTerminated(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end >= 0 ? end : slice.length).toString("utf8");
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}
