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
- Local-only Skill source research, including private machine paths, personal
  skill inventories, local catalog analysis outputs, and unpublished curation
  decisions.

When a local note becomes stable and useful to contributors, promote it into
`docs/` and commit the cleaned version.

## Skill Source Research Boundary

Skill source research has an extra privacy boundary:

- Local or personal Skill repositories stay local. Their paths, generated
  indexes, catalog analysis reports, and notes belong under `_local-dev/` or
  another ignored local directory.
- Public Skill sources can be published only after their repository URL, license
  or redistribution posture, source locator, risk profile, and curation notes
  have been reviewed.
- Published manifests should point to source repositories and normalized
  metadata. They should not embed third-party private skill bodies or local
  filesystem paths.
- If local research produces generally useful taxonomy rules, scoring insights,
  or source-evaluation criteria, publish the cleaned rule or criterion rather
  than the private inventory itself.
