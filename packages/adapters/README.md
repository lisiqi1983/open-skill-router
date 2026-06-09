# Adapters

Adapters isolate external systems.

Planned groups:

- `github`: locator parsing, repository discovery, commit resolution, archive fetch.
- `agent-hosts`: generic Agent Skills, Claude Code, Cursor, Codex, and Copilot adapters.

Implemented groups:

- `github`: GitHub REST tree/blob fetch with ref-to-commit resolution.
- `local`: local skill folder fetch.
- `generic agent host`: copy cached skills into an Agent Skills-compatible directory.
