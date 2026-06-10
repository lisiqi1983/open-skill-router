# Source Curation Policy

Use this policy when researching real Skill sources, building seed manifests, or
deciding whether research output can be published.

## Directory Rules

- Store local or personal Skill research under the user's SkillRouter home:
  `~/.skillrouter/research/local-skill-research/`.
- Use this layout for local research:
  `source-manifests/`, `indexes/`, `catalogs/`, `analyses/`, and `notes/`.
- Do not store long-term local Skill research inside the Open Skill Router
  development repository.
- Use a project `.skillrouter/` directory only for project-specific runtime
  output such as temporary indexes or source registries.

## Local-Only Track

Keep these private unless the user explicitly asks to promote a cleaned summary:

- machine-local Skill paths
- personal Skill inventories
- generated local indexes
- generated local catalogs
- catalog analysis reports for private sources
- unpublished curation decisions

## Public Track

Publish only public, reviewable Skill sources.

Before adding a public Skill to a committed manifest, check:

- source locator and repository URL
- stable ref or version strategy
- license or redistribution posture
- risk level and permission posture
- curated domains, intents, environments, and notes

Published manifests should point to source locators and normalized metadata.
They should not embed private Skill bodies or private local filesystem paths.

If local research produces useful taxonomy or scoring insights, publish the
cleaned rule or insight, not the private inventory.
