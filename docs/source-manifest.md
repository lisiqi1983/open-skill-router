# Source Manifest

`skillrouter.source.yaml` lets maintainers publish a curated list of skill
sources without hosting skill packages.

`skillrouter.public-seed.yaml` follows the same schema and is used for the
community-maintained public Skill research seed.

## File Name

```text
skillrouter.source.yaml
```

## Example

```yaml
schema_version: "skillrouter.source/v1"
name: "kafa-recommended-agent-skills"
description: "Curated Agent Skills for research, patent, engineering, and coding workflows."
maintainer: "Siqi Li"
updated_at: "2026-06-09"

sources:
  - type: github
    repo: anthropics/skills
    ref: main
    include:
      - "skills/**/SKILL.md"

skills:
  - id: "kafa.patent-disclosure-analysis"
    source:
      type: github
      repo: "kafa-labs/agent-skills"
      path: "skills/patent-disclosure-analysis"
      ref: "v0.1.0"
    tags:
      - patent
      - disclosure
      - report
    notes: "适合中文专利交底书分析。"
```

## CLI Commands

```bash
skillrouter index-source ./skillrouter.source.yaml --out ./public/index
skillrouter index-source ./skillrouter.public-seed.yaml --out ./public/open-skill-router/public-seed/index
skillrouter source add ./public/index public --mirror https://mirror.example.com/index/
skillrouter source list
skillrouter source health public
skillrouter recommend "分析专利交底书" --source public
```

The indexer app can also be called directly:

```bash
open-skill-router-indexer build ./skillrouter.source.yaml --out ./public/index
```

## Static Output

`index-source` writes:

```text
index.json
skills.jsonl
skills.jsonl.sha256
```

`index.json` has schema `skillrouter.static-index/v1` and points to the JSONL
and checksum files. `skills.jsonl` contains one
`skillrouter.skill-record/v1` record per skill. The CLI verifies
`skills.jsonl` against `skillsSha256` when reading a static index through
`--source`.

Remote static indexes are cached under the SkillRouter home directory at
`.skillrouter/cache/static-sources`. If the network source is temporarily
unavailable, the reader can fall back to the last cached snapshot for that URL.

`source health` checks the primary source and mirrors, validates checksums, and
reports whether each mirror's `skills.jsonl` hash matches the primary source.

## Supported Inputs

M4 supports:

- `sources[].type: local` for discovering all `SKILL.md` files under a local
  directory.
- `skills[].source.type: local` for explicitly listing one local skill.
- `skills[].source.type: github` for explicitly listing one GitHub skill folder.

GitHub repository-wide include globs are parsed but not expanded yet. For now,
list GitHub skills explicitly under `skills`.

`--skip-invalid` can be used during research to continue indexing valid local
Skills while reporting malformed `SKILL.md` files. Do not rely on it to hide
invalid entries in a public manifest; public entries should be fixed or removed
before publishing.

## Design Notes

- Manifests point to source repositories.
- They may add curated tags and notes.
- They do not embed third-party skill package contents.
- They should be hashable and cacheable.
- Static snapshots can be published through GitHub Pages, Releases, or any
  mirror that serves plain files.

See [Public Skill Seed](public-skill-seed.md) for the shared public curation
manifest and contribution checklist.

## Public Curation Policy

Use two tracks when researching real Skill sources:

- Local track: personal or machine-local Skill repositories are indexed and
  analyzed locally only. Keep their manifests, catalog analysis outputs, and
  notes under the user's SkillRouter home, preferably
  `~/.skillrouter/research/local-skill-research/`, unless the user explicitly
  promotes a cleaned version.
- Public track: publish only sources that are already public and reviewable.
  Before adding a public Skill to a committed manifest, record its source
  locator, stable ref or version strategy, curation tags, risk posture, and any
  license or redistribution concern in the manifest notes or related docs.

Published static indexes are for discovery metadata. They should not expose
private local paths or unpublished Skill bodies.
