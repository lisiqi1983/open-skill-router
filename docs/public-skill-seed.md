# Public Skill Seed

`skillrouter.public-seed.yaml` is the first publishable Skill research seed for
Open Skill Router. It contains only public, reviewable source locators and
curated metadata. It does not contain private local paths or unpublished Skill
bodies.

## Purpose

The public seed gives users and contributors a shared starting point for real
Skill discovery research:

- compare public Skills with the same catalog dimensions used for local Skills
- test recommendation quality against known public sources
- publish a static index that can be mirrored
- accept community updates through normal repository review

## Published Index

The GitHub Pages workflow builds two static indexes:

```text
public/open-skill-router/index/
public/open-skill-router/public-seed/index/
```

After Pages is enabled, the canonical public seed URL is:

```text
https://lisiqi1983.github.io/open-skill-router/open-skill-router/public-seed/index/
```

Use it locally:

```bash
skillrouter source add https://lisiqi1983.github.io/open-skill-router/open-skill-router/public-seed/index/ public-seed
skillrouter source health public-seed
skillrouter catalog build --source public-seed --json
skillrouter catalog analyze --source public-seed --json
skillrouter recommend "review a GitHub PR and address comments" --source public-seed
```

Build it from source:

```bash
skillrouter index-source ./skillrouter.public-seed.yaml --out ./public/open-skill-router/public-seed/index
```

If a research manifest may include malformed local Skills, use:

```bash
skillrouter index-source ./local-source.yaml --out ./tmp/index --skip-invalid
skillrouter index ./some-skill-root --out ./tmp/index.json --skip-invalid
```

`--skip-invalid` is for research indexing only. Publishing should still prefer
fixing or removing invalid public entries.

## Current Seed

The first seed was verified on 2026-06-10 and includes 12 public Skills from:

- OpenAI GitHub plugin Skills in `openai/plugins`
- NVIDIA plugin Skills in `NVIDIA/skills`
- HeyGen Skills in `heygen-com/skills`

Each entry is pinned to a commit ref and includes curation tags plus a short
note about license posture or operational purpose.

Initial catalog analysis:

- 12/12 Skills have domain, intent, environment, workflow stage, risk, and
  source-type coverage.
- 0/12 Skills currently have explicit capability, input format, output format,
  or language coverage.
- 9/12 Skills are inferred as high risk because they touch GitHub, APIs,
  filesystem operations, deployment, or other operator workflows.

The next public curation pass should add richer capability/input/output/language
metadata and review high-risk entries one by one.

## Deferred Sources

These sources were researched but are not included in the first public seed:

- Local personal Skills: kept local only under the user's SkillRouter home.
- Proprietary or no public source confirmed: Data Analytics, Browser, Chrome,
  Computer Use, and OpenAI primary runtime plugin cache Skills.
- Fetch-deferred public candidates: Remotion, OpenAI `gh-fix-ci`, several
  NVIDIA nested Skills, and one HeyGen avatar Skill. These need a source fetch
  fallback or manual manifest correction before publishing.

Deferred does not mean rejected. It means the public seed should stay
reproducible and easy to verify.

## Contribution Checklist

Before adding a public Skill:

- Confirm the source repository and `SKILL.md` path are public.
- Pin a commit ref or document a version strategy.
- Check license and redistribution posture.
- Add tags that help multidimensional scoring.
- Add notes for risk, required environment, or curation caveats.
- Build the static index locally.
- Run `skillrouter catalog analyze` on the built index and review sparse fields.

Do not commit generated local catalogs or private research output. If local
research reveals a useful rule, publish the cleaned rule rather than the private
inventory.
