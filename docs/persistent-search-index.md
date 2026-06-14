# Persistent Search Index

M14 adds a dependency-free persistent search index for large Skill collections.
M15 adds freshness checks and incremental rebuild support. The search index is a
JSON artifact with schema `skillrouter.search-index/v1`.

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

Skip rebuilds when the existing index is still fresh:

```bash
skillrouter search-index build --source public --out .skillrouter/public-search-index.json --if-stale
```

Reuse unchanged Skill documents when rebuilding:

```bash
skillrouter search-index build --source public --out .skillrouter/public-search-index.json --incremental
```

## Search

```bash
skillrouter search "review GitHub PR TypeScript code changes" --search-index .skillrouter/search-index.json --max 20
skillrouter search "review GitHub PR TypeScript code changes" --source public --max 20
```

The returned search result remains `skillrouter.search/v1`, the same shape used
by in-memory search. When `--source` points to a static source that publishes
`search-index.json`, the CLI automatically reads that artifact instead of
building search documents from `skills.jsonl`.

## Recommend

```bash
skillrouter recommend "review GitHub PR TypeScript code changes" --search-index .skillrouter/search-index.json --search-max 50 --candidate-pack
skillrouter recommend "review GitHub PR TypeScript code changes" --source public --search-max 50 --candidate-pack
```

Passing `--search-index` to `recommend` automatically enables search prefiltering
for the local CLI path. The persistent index is also sufficient to reconstruct
the local recommendation index because it stores bounded normalized
`IndexedSkill` records. Static sources published by M16 include the same
artifact, so `recommend --source public` auto-enables the prefilter when
`search-index.json` is available and falls back to full static-source scoring
for older snapshots.

## Freshness

M15 adds source and per-Skill fingerprints to persistent search indexes. Use
`status` to check whether the search index still matches the source local index
or static source:

```bash
skillrouter search-index status --source public --search-index .skillrouter/public-search-index.json
```

The report uses schema `skillrouter.search-index-freshness/v1` and includes:

- `status`: `fresh` or `stale`
- expected and actual source fingerprints
- missing Skill IDs
- stale Skill IDs
- extra Skill IDs
- human-readable reasons

Fingerprints ignore volatile index generation timestamps, including
per-record `indexedAt`, and focus on stable Skill metadata, locator, root path,
`SKILL.md` path, and indexed body content.

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

Run `search-index status` or `search-index build --if-stale` after the source
local index or static source snapshot changes. Use `--incremental` when the
existing output index is large and most Skill documents are unchanged. Public
static snapshots now distribute `search-index.json` and
`search-index.json.sha256` beside `skills.jsonl`, so mirrors should sync both
the full snapshot and the prebuilt retrieval artifact.
