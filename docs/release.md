# Release Packaging

M6 makes Open Skill Router publishable from GitHub without requiring a database
service. The release bundle focuses on static skill metadata because that is the
piece mirrors and CDN hosts need to serve consistently.

## Local Bundle

Build and verify the release bundle:

```bash
pnpm test:release
```

This command builds the workspace, generates the static index from
`skillrouter.source.yaml`, creates a release archive, writes a release manifest,
and verifies all checksums.

Output directory:

```text
dist/release/
  open-skill-router-static-index.tar.gz
  release-manifest.json
  checksums.sha256
  public/open-skill-router/index/
    index.json
    skills.jsonl
    skills.jsonl.sha256
    search-index.json
    search-index.json.sha256
```

`dist/release/public/open-skill-router/index/` is the same directory shape used
by GitHub Pages and mirror hosts. `open-skill-router-static-index.tar.gz`
contains that directory tree for GitHub Releases and manual mirror sync.

## Release Manifest

`release-manifest.json` uses schema `skillrouter.release/v1` and records:

- Package version.
- Git commit and ref.
- Static index location, skill count, generated time, `skillsSha256`, and
  `searchIndexSha256`.
- GitHub Pages URL and GitHub Release asset base URL.
- Artifact byte sizes and SHA-256 hashes.

`checksums.sha256` covers every release file except itself. Mirrors should copy
the files exactly and compare their hashes with this file after sync.

## GitHub Workflows

`ci.yml` runs on pushes and pull requests to `main`:

- Formatting.
- Typecheck.
- Unit tests.
- M0-M16 smoke tests, including static source search-index reuse.
- M6 release bundle smoke.

`publish-index.yml` publishes the static index to GitHub Pages.

`release.yml` runs on `v*` tags or manual dispatch. It rebuilds and verifies the
bundle, then uploads these assets to the GitHub Release:

- `open-skill-router-static-index.tar.gz`
- `release-manifest.json`
- `checksums.sha256`
- `index.json`
- `skills.jsonl`
- `skills.jsonl.sha256`
- `search-index.json`
- `search-index.json.sha256`

## Mirror Contract

Mirror hosts should serve the same five static index files with identical
relative paths:

```text
open-skill-router/index/index.json
open-skill-router/index/skills.jsonl
open-skill-router/index/skills.jsonl.sha256
open-skill-router/index/search-index.json
open-skill-router/index/search-index.json.sha256
```

After syncing a mirror, check it from a client:

```bash
skillrouter source add https://primary.example/open-skill-router/index/ public --mirror https://mirror.example/open-skill-router/index/
skillrouter source health public
skillrouter recommend "帮我生成一份产品发布 PPT" --source public
```

The mirror is healthy when `skillrouter source health` reports matching
`skillsSha256` and `searchIndexSha256` values for primary and mirror.
