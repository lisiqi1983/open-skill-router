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

When a local note becomes stable and useful to contributors, promote it into
`docs/` and commit the cleaned version.

