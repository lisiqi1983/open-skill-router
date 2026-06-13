# Persistent Search Index

M14 adds a dependency-free persistent search index for large Skill collections.
It is a JSON artifact with schema `skillrouter.search-index/v1`.

The persistent index precomputes:

- normalized search text
- token counts and document frequencies
- catalog dimensions
- weighted skill vectors
- quality and safety metadata needed by retrieval

This keeps the first implementation local-first and mirror-friendly while
creating a stable contract for future SQLite FTS, vector, or hosted search
backends.

## Build

Build from a local index:

```bash
skillrouter index ./examples/mock-skills --out .skillrouter/index.json
skillrouter search-index build --index .skillrouter/index.json --out .skillrouter/search-index.json
```

Build from a static source:

```bash
skillrouter search-index build --source public --out .skillrouter/public-search-index.json
```

## Search

```bash
skillrouter search "review GitHub PR TypeScript code changes" --search-index .skillrouter/search-index.json --max 20
```

The returned search result remains `skillrouter.search/v1`, the same shape used
by in-memory search.

## Recommend

```bash
skillrouter recommend "review GitHub PR TypeScript code changes" --search-index .skillrouter/search-index.json --search-max 50 --candidate-pack
```

Passing `--search-index` to `recommend` automatically enables search prefiltering
for the local CLI path. The persistent index is also sufficient to reconstruct
the local recommendation index because it stores bounded normalized
`IndexedSkill` records.

## MCP

MCP callers can pass `search_index_path` to `recommend_skills`:

```json
{
  "task": "review TypeScript code changes for bugs",
  "search_index_path": ".skillrouter/search-index.json",
  "search_max_results": 50
}
```

When `search_index_path` is supplied, `recommend_skills` uses the persistent
index as the recommendation source and automatically runs search prefiltering.

## API

The HTTP API does not let request bodies choose arbitrary server file paths.
Configure a server-side search index at startup:

```bash
open-skill-router-api serve --search-index .skillrouter/search-index.json --port 8765
```

Then clients can request search-prefiltered recommendation normally:

```json
{
  "task": "review TypeScript code changes for bugs",
  "search_prefilter": true,
  "search_max_results": 50
}
```

## Operating Rule

Rebuild the persistent search index whenever the source local index or static
source snapshot changes. Mirrors may distribute search indexes beside static
index snapshots in later milestones, but M14 keeps them as local artifacts.
