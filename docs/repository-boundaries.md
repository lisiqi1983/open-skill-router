# Repository Boundaries

The project has two documentation zones.

## Public Repository Zone

This zone is committed and pushed to GitHub.

Examples:

- `README.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `docs/`
- `apps/`
- `packages/`
- `examples/`
- Tests and source code.

Public docs should describe stable product direction, architecture, security
principles, roadmap, and contributor expectations.

## Local Development Zone

This zone lives in `_local-dev/` and is ignored by git.

Examples:

- Working notes.
- Internal execution plans.
- Decision logs before they are cleaned up for public docs.
- Release checklists.
- Scratch architecture notes.
- Local-only development plans about Skill source research.

When a local note becomes stable and useful to contributors, promote it into
`docs/` and commit the cleaned version.

## Skill Source Research Boundary

Skill source research has an extra privacy boundary:

- Local or personal Skill repositories stay local. Their paths, generated
  indexes, catalog analysis reports, and notes belong under the user's
  SkillRouter home, preferably `~/.skillrouter/research/local-skill-research/`.
  `_local-dev/` is only for development notes about this repository, not for the
  long-term local Skill research inventory.
- Public Skill sources can be published only after their repository URL, license
  or redistribution posture, source locator, risk profile, and curation notes
  have been reviewed.
- Published manifests should point to source repositories and normalized
  metadata. They should not embed third-party private skill bodies or local
  filesystem paths.
- If local research produces generally useful taxonomy rules, scoring insights,
  or source-evaluation criteria, publish the cleaned rule or criterion rather
  than the private inventory itself.

See [User Data Directories](user-data-directories.md) for the default directory
layout.
