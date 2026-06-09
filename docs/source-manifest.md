# Source Manifest

`skillrouter.source.yaml` lets maintainers publish a curated list of skill
sources without hosting skill packages.

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
skillrouter index-source ./skillrouter.source.yaml
skillrouter index-source github:lisiqi1983/skillrouter-sources@main
```

## Design Notes

- Manifests point to source repositories.
- They may add curated tags and notes.
- They do not embed third-party skill package contents.
- They should be hashable and cacheable.

