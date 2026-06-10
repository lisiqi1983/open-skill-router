#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

const repoRoot = process.cwd();
const releaseRoot = path.resolve(
  process.env.SKILLROUTER_RELEASE_DIR ?? path.join("dist", "release"),
);
const publicRoot = path.join(releaseRoot, "public");
const indexDir = path.join(publicRoot, "open-skill-router", "index");
const sourceManifest = "skillrouter.source.yaml";
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const archivePath = path.join(
  releaseRoot,
  "open-skill-router-static-index.tar.gz",
);
const releaseManifestPath = path.join(releaseRoot, "release-manifest.json");
const checksumsPath = path.join(releaseRoot, "checksums.sha256");

await ensureBuiltCli();
await fs.rm(releaseRoot, { recursive: true, force: true });
await fs.mkdir(indexDir, { recursive: true });

const indexResult = await runCli([
  "index-source",
  sourceManifest,
  "--out",
  indexDir,
  "--json",
]);
const staticBuild = JSON.parse(indexResult);
const staticManifest = JSON.parse(
  await fs.readFile(path.join(indexDir, "index.json"), "utf8"),
);

await createTarGzFromDirectory({
  rootDir: publicRoot,
  includeDir: indexDir,
  outPath: archivePath,
});

const git = await readGitMetadata();
const packageJson = JSON.parse(
  await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
);
const releaseTag = process.env.GITHUB_REF_NAME ?? git.ref ?? "local";
const repository =
  process.env.GITHUB_REPOSITORY ?? "lisiqi1983/open-skill-router";
const artifacts = await describeArtifacts([
  path.join(indexDir, "index.json"),
  path.join(indexDir, "skills.jsonl"),
  path.join(indexDir, "skills.jsonl.sha256"),
  archivePath,
]);

const releaseManifest = {
  schemaVersion: "skillrouter.release/v1",
  name: "open-skill-router",
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  git,
  sourceManifest,
  staticIndex: {
    directory: toPosix(path.relative(releaseRoot, indexDir)),
    manifestPath: toPosix(path.relative(releaseRoot, staticBuild.manifestPath)),
    skillsPath: toPosix(path.relative(releaseRoot, staticBuild.skillsPath)),
    checksumPath: toPosix(path.relative(releaseRoot, staticBuild.checksumPath)),
    skillCount: staticManifest.skillCount,
    skillsSha256: staticManifest.skillsSha256,
    generatedAt: staticManifest.generatedAt,
  },
  distribution: {
    githubPagesIndexUrl:
      process.env.SKILLROUTER_PAGES_INDEX_URL ??
      defaultPagesIndexUrl(repository),
    releaseAssetBaseUrl:
      process.env.SKILLROUTER_RELEASE_ASSET_BASE_URL ??
      `https://github.com/${repository}/releases/download/${releaseTag}/`,
    mirrorContract:
      "Mirror hosts should serve index.json, skills.jsonl, and skills.jsonl.sha256 with the same relative paths and matching checksums.",
  },
  artifacts,
  checksumsPath: "checksums.sha256",
};

await fs.writeFile(
  releaseManifestPath,
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
  "utf8",
);

await writeChecksums(releaseRoot, checksumsPath);

console.log(
  JSON.stringify(
    {
      releaseRoot,
      archivePath,
      releaseManifestPath,
      checksumsPath,
      skillCount: staticManifest.skillCount,
      skillsSha256: staticManifest.skillsSha256,
    },
    null,
    2,
  ),
);

async function ensureBuiltCli() {
  try {
    await fs.access(cliPath);
  } catch {
    throw new Error(
      `Built CLI not found at ${cliPath}. Run "pnpm build" before building the release bundle.`,
    );
  }
}

async function runCli(args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function readGitMetadata() {
  const commit =
    process.env.GITHUB_SHA ?? (await tryGit(["rev-parse", "HEAD"]));
  const ref =
    process.env.GITHUB_REF_NAME ??
    (await tryGit(["rev-parse", "--abbrev-ref", "HEAD"]));
  const isDirty =
    process.env.GITHUB_ACTIONS === "true"
      ? false
      : (await tryGit(["status", "--porcelain"])) !== "";

  return {
    commit: commit || undefined,
    ref: ref || undefined,
    dirty: isDirty,
  };
}

async function tryGit(args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function createTarGzFromDirectory({ rootDir, includeDir, outPath }) {
  const files = await collectFiles(includeDir);
  const chunks = [];

  for (const filePath of files) {
    const archiveName = toPosix(path.relative(rootDir, filePath));
    const content = await fs.readFile(filePath);
    chunks.push(createTarHeader(archiveName, content.byteLength));
    chunks.push(content);
    const padding = paddingLength(content.byteLength);
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }

  chunks.push(Buffer.alloc(1024));
  await fs.writeFile(outPath, await gzipAsync(Buffer.concat(chunks)));
}

function createTarHeader(name, size) {
  if (Buffer.byteLength(name) > 100) {
    throw new Error(`Tar entry path is too long for ustar header: ${name}`);
  }

  const header = Buffer.alloc(512);
  writeString(header, name, 0, 100);
  writeOctal(header, 0o644, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, "ustar", 257, 6);
  writeString(header, "00", 263, 2);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeString(buffer, value, offset, length) {
  buffer.write(
    value,
    offset,
    Math.min(Buffer.byteLength(value), length),
    "utf8",
  );
}

function writeOctal(buffer, value, offset, length) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  buffer.write(encoded.slice(-(length - 1)), offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function paddingLength(size) {
  return (512 - (size % 512)) % 512;
}

async function describeArtifacts(files) {
  const artifacts = [];
  for (const filePath of files) {
    const stat = await fs.stat(filePath);
    artifacts.push({
      path: toPosix(path.relative(releaseRoot, filePath)),
      bytes: stat.size,
      sha256: await sha256File(filePath),
    });
  }
  return artifacts;
}

async function writeChecksums(rootDir, outPath) {
  const files = (await collectFiles(rootDir)).filter(
    (filePath) => path.resolve(filePath) !== path.resolve(outPath),
  );
  const lines = [];
  for (const filePath of files) {
    lines.push(
      `${await sha256File(filePath)}  ${toPosix(path.relative(rootDir, filePath))}`,
    );
  }
  await fs.writeFile(outPath, `${lines.sort().join("\n")}\n`, "utf8");
}

async function collectFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

function defaultPagesIndexUrl(repository) {
  const [owner, repo] = repository.split("/");
  return `https://${owner}.github.io/${repo}/open-skill-router/index/`;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
