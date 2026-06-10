# Indexer

The indexer reads public sources and produces normalized skill metadata.

Inputs:

- GitHub repository locators.
- Local Agent Skills-compatible folders.
- `skillrouter.source.yaml` manifests.

Outputs:

- JSONL metadata snapshots.
- `index.json` metadata.
- `skills.jsonl.sha256` checksums.

## Build

```bash
pnpm build
node apps/indexer/dist/index.js build skillrouter.source.yaml --out public/open-skill-router/index
```

The CLI exposes the same path:

```bash
node apps/cli/dist/index.js index-source skillrouter.source.yaml --out public/open-skill-router/index
```
