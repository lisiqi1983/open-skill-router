# Catalog Analysis

M10 adds a read-only analysis layer on top of `skillrouter.catalog/v1`.

The goal is to make real Skill research practical before automatic learning is
available. A catalog analysis answers three questions:

- Which dimensions are well classified?
- Which skills are missing useful routing metadata?
- Which dimension interactions are already populated enough to guide routing?

## Schema

The JSON output uses schema `skillrouter.catalog-analysis/v1`.

It contains:

- `dimensions`: coverage, top values, singleton values, and unclassified skills
  for domains, intents, capabilities, inputs, outputs, environments, workflow
  stages, languages, risk level, and source type.
- `matrixSlices`: compact tensor-style slices such as `domain_by_output`,
  `domain_by_workflow`, `input_by_output`, and `environment_by_risk`.
- `skillProfiles`: one compact vector-style profile per skill.
- `gaps`: missing dimensions, sparse values, unknown risk, and high-risk skills
  that should be reviewed before confident routing.

This layer does not install, execute, or load skills. It only reads normalized
catalog metadata.

## CLI Usage

Analyze a local index:

```bash
skillrouter index ./examples/mock-skills
skillrouter catalog analyze \
  --index .skillrouter/index.json \
  --out .skillrouter/catalog-analysis.json \
  --markdown .skillrouter/catalog-analysis.md
```

Analyze a named or direct remote static source:

```bash
skillrouter source add https://example.com/open-skill-router/index/ public
skillrouter catalog analyze --source public --json
skillrouter catalog analyze \
  --source https://example.com/open-skill-router/index/ \
  --markdown catalog-analysis.remote.md
```

Analyze an existing catalog file:

```bash
skillrouter catalog build --source public --out catalog.json
skillrouter catalog analyze --catalog catalog.json --json
```

Run the smoke test:

```bash
pnpm test:analysis
```

## How This Helps Recommendation

The current recommender scores individual dimensions with configurable M9
weights. Catalog analysis makes the next routing improvements visible:

- If many skills lack `outputFormats`, output-heavy tasks need more model rerank
  help or better metadata.
- If `domain_by_output` has dense cells, those pairs can become explicit
  interaction terms.
- If `environment_by_risk` shows high-risk network or shell skills, strict-local
  tasks should filter or down-rank them.
- If a useful skill has sparse domain or workflow values, curators can improve
  its `SKILL.md` front matter before changing scoring code.

In other words, M10 is the research and observability layer for future
feedback-tuned or tensor-style recommendation.
