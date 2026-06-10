# GitHub Deployment and Mirrors

Open Skill Router should use GitHub as the primary public home while keeping the
router/source distinction clear.

## Primary GitHub Repository

Recommended repository:

```text
github.com/lisiqi1983/open-skill-router
```

Primary contents:

- Source code.
- Public docs.
- Example source manifests.
- Example mock skills for tests.
- GitHub Actions workflows.
- Release artifacts.
- Static index snapshots.

## What We Mirror

Mirror:

- Repository source code.
- Documentation site.
- `skillrouter.source.yaml` files.
- Normalized metadata snapshots.
- Checksums.
- Release packages.
- npm package metadata through normal package registries.

Do not mirror:

- Third-party skill package bodies unless they are explicitly part of this repository.
- User task logs.
- User feedback with sensitive text.
- Local cache contents.

## Mirror Strategy

### Code Mirrors

Use GitHub as upstream, then optionally mirror to:

- Gitee.
- GitCode.
- AtomGit.
- Other read-only Git hosts.

### Static Index Mirrors

Publish index snapshots to:

- GitHub Pages.
- GitHub Releases.
- jsDelivr through npm or GitHub release assets.
- Cloudflare Pages.
- Regional static hosting if needed.

### Package Mirrors

Publish packages to npm first. Users in slower regions can consume through npm
registry mirrors.

## Recommended URL Priority

The CLI should support multiple index sources and fail over in order:

```text
1. User-configured local index.
2. User-configured mirror URL.
3. GitHub Pages canonical index.
4. GitHub release snapshot.
5. Direct GitHub source lookup.
```

## GitHub Actions Plan

Initial workflows:

- `ci.yml`: install, format-check, typecheck, unit tests, smoke tests, and release bundle smoke.
- `release.yml`: build and verify release artifacts, then upload them to GitHub Releases.
- `publish-index.yml`: build static index snapshots and publish to Pages.

Static index files:

```text
public/open-skill-router/index/index.json
public/open-skill-router/index/skills.jsonl
public/open-skill-router/index/skills.jsonl.sha256
public/open-skill-router/public-seed/index/index.json
public/open-skill-router/public-seed/index/skills.jsonl
public/open-skill-router/public-seed/index/skills.jsonl.sha256
```

The M4 workflow `.github/workflows/publish-index.yml` builds this directory from
the root `skillrouter.source.yaml` and deploys it to GitHub Pages. The public
Skill research seed is built from `skillrouter.public-seed.yaml`.

M6 adds a release bundle under `dist/release/`:

```text
dist/release/open-skill-router-static-index.tar.gz
dist/release/release-manifest.json
dist/release/checksums.sha256
dist/release/public/open-skill-router/index/index.json
dist/release/public/open-skill-router/index/skills.jsonl
dist/release/public/open-skill-router/index/skills.jsonl.sha256
```

The tag/manual `release.yml` workflow uploads the archive, manifest, checksums,
and raw static index files to GitHub Releases. Mirror operators can copy either
the raw files or unpack the archive, then verify hashes against
`checksums.sha256`.

Canonical source URL shape:

```text
https://<owner>.github.io/<repo>/open-skill-router/index/
https://<owner>.github.io/<repo>/open-skill-router/public-seed/index/
```

CLI usage:

```bash
skillrouter source add https://<owner>.github.io/<repo>/open-skill-router/index/ public
skillrouter source add https://<owner>.github.io/<repo>/open-skill-router/public-seed/index/ public-seed
skillrouter source add https://<owner>.github.io/<repo>/open-skill-router/index/ public --mirror https://mirror.example.com/open-skill-router/index/
skillrouter source health public
skillrouter recommend "帮我生成一份产品发布 PPT" --source public
```

Mirror hosts should serve the same three files with identical relative paths.
`skills.jsonl.sha256` allows clients and users to compare mirrors against the
canonical snapshot.

## M4.5 Failover and Health

Source registry entries support one primary URL and zero or more mirrors:

```json
{
  "name": "public",
  "url": "https://lisiqi1983.github.io/open-skill-router/open-skill-router/index/",
  "mirrors": ["https://mirror.example.com/open-skill-router/index/"]
}
```

When recommending with `--source public`, the CLI tries the primary URL first and
then mirrors in order. Successful remote reads are cached locally under
`.skillrouter/cache/static-sources`; temporary network failures can fall back to
the cached snapshot for the same URL.

`skillrouter source health public` checks each configured URL, validates the
manifest checksum, and reports whether mirror hashes match the primary. A mirror
with a different `skillsSha256` should be treated as stale or divergent until it
is refreshed.

## M6 Release and Mirror Validation

Build and validate the release bundle locally:

```bash
pnpm test:release
```

The release bundle smoke verifies:

- `release-manifest.json` schema and static index metadata.
- `checksums.sha256` for every release file except itself.
- `open-skill-router-static-index.tar.gz` contains the static index files.
- `skillrouter source health` can read the generated index directory.

Recommended mirror sync flow:

1. Use GitHub Pages as the canonical source URL.
2. Use GitHub Release assets as a durable snapshot channel.
3. Copy `public/open-skill-router/index/` to CDN or regional static hosts.
4. Compare mirror files with `checksums.sha256`.
5. Register mirrors with `skillrouter source add --mirror`.
6. Run `skillrouter source health public` before advertising the mirror.
