# Unified Skill Catalog

M7 introduces a shared catalog layer for local and remote skills. The goal is to
make skill recommendation less like plain text search and more like comparing a
task against multiple skill dimensions.

## Local and Remote Sync Model

Open Skill Router treats local and remote skills as different ingestion paths
that converge into the same normalized model:

```text
local Agent Skills folders
GitHub skill locators
static JSONL index snapshots
HTTP API sources
        |
        v
LocalSkillIndex
        |
        v
SkillCatalog
        |
        v
recommendation, model rerank, install, update
```

Local skills are discovered directly from `SKILL.md` files. Remote skills are
read through explicit locators, source manifests, static snapshots, or mirror
URLs. After ingestion, both become indexed skill records with the same fields:
locator, source type, description, tags, capabilities, input/output formats,
permissions, risk level, quality signals, and body text.

The catalog does not install or execute skills. It is a read-only analytical
layer used to classify, compare, and explain.

## Catalog Dimensions

Each `SkillCatalogCard` contains these dimensions:

- `intents`: what the skill is trying to do.
- `domains`: subject or work domain.
- `capabilities`: concrete abilities declared by the skill.
- `inputFormats`: expected input forms.
- `outputFormats`: produced output forms.
- `environments`: required runtime or external surface.
- `workflowStages`: where the skill fits in a task lifecycle.
- `languages`: supported natural languages.
- `riskLevel`: deterministic safety level.
- `sourceType`: local, GitHub, registry, or custom source.

These dimensions are deliberately separated. A task that asks for a PPT should
weight `outputFormats` strongly. A task that says "local only" should weight
`environments` and `riskLevel` strongly. A GitHub PR task should weight domain,
input surface, and workflow stage together.

## Similarity Strategy

The catalog enables a staged recommendation strategy:

1. Hard filter: remove skills that cannot satisfy source, privacy, runtime, or
   required input/output constraints.
2. Multi-view recall: retrieve candidates from intent, domain, input, output,
   environment, and workflow dimensions.
3. Weighted scoring: combine per-dimension similarity with risk and quality
   signals.
4. Model rerank: pass a bounded candidate pack to the user's model when deeper
   comparison is useful.
5. Deterministic safety gate: keep install and update decisions outside the
   model.

This can later evolve into a tensor-style approximation where interactions such
as `domain x output`, `input x workflow`, and `risk x environment` are scored
explicitly.

## CLI Usage

Build a catalog from a local index:

```bash
skillrouter index ./examples/mock-skills
skillrouter catalog build --index .skillrouter/index.json --out .skillrouter/catalog.json
```

Build a catalog from a named or direct remote static source:

```bash
skillrouter source add https://example.com/open-skill-router/index/ public
skillrouter catalog build --source public --json
skillrouter catalog build --source https://example.com/open-skill-router/index/ --out catalog.remote.json
```

The JSON output uses schema `skillrouter.catalog/v1`.
