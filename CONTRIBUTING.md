# Contributing

Open Skill Router is early-stage. The most useful contributions are small,
testable changes that preserve the core boundary: discover, recommend, explain,
cache, and install skills without becoming a third-party skill host.

## Local Development

```bash
pnpm install
pnpm test
pnpm build
```

The package layout is intentionally modular so CLI, MCP server, API, and indexer
share the same core logic.

## Design Rules

- Keep network access inside source adapters.
- Keep agent-specific install behavior inside agent-host adapters.
- Do not execute third-party skill scripts as part of indexing or installation.
- Store commit SHA and content hash for installed skills.
- Generate recommendation explanations from structured signals, not opaque text alone.
- Add tests for parser, scoring, cache, lockfile, and risk behavior.

## Security

If you find a security issue, please open a private advisory or contact the
maintainers before publishing details.
