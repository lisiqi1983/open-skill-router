# Large-Scale Skill Search

M12 adds a deterministic retrieval stage for large Skill collections. The goal is
to search thousands of local or remote Skills before handing a small candidate
set to recommendation or model reranking.

## Search Flow

```text
query
  -> task profile
  -> source/risk/domain/intent/environment filters
  -> BM25-lite lexical scoring
  -> weighted semantic dimension scoring
  -> catalog fit scoring
  -> quality and safety priors
  -> top-k search hits
```

The first implementation stays dependency-free and runs inside the core runtime.
It is meant to be the stable contract before adding SQLite FTS, vector indexes,
or a hosted search service.

## CLI

```bash
skillrouter search "review GitHub PR TypeScript code changes" --source public --max 20
skillrouter search "generate product launch slides" --index .skillrouter/index.json --domain presentation --risk medium
skillrouter search "local PDF report writing" --local-only --environment local_filesystem --json
```

Supported filters:

- `--source-type github,local`
- `--risk low,medium,high,unknown`
- `--domain presentation,github`
- `--intent code_review,skill_discovery`
- `--environment github,filesystem,local_filesystem`
- `--local-only`

## How It Should Be Used

For thousands of Skills, use `search` as the retrieval layer:

```text
search top 50
  -> recommend top 10
  -> candidate pack top 5-20
  -> caller model rerank
```

Do not ask a model to inspect the full Skill corpus. The model should only see a
bounded candidate pack after deterministic search and safety filtering.

M13 wires this into recommendation directly:

```bash
skillrouter recommend "review GitHub PR TypeScript code changes" --source public --search-prefilter --search-max 50 --candidate-pack
```

With `--search-prefilter`, recommendation only scores the top search hits. The
returned result includes `searchPrefilter` so callers can inspect the retrieval
stage that produced the candidate pool. Candidate packs are then generated only
from the final recommendation set, not from the full corpus.

M14 adds a persistent search index so repeated queries do not need to rebuild
search documents from the full Skill index:

```bash
skillrouter search-index build --source public --out .skillrouter/public-search-index.json
skillrouter search-index status --source public --search-index .skillrouter/public-search-index.json
skillrouter search "review GitHub PR TypeScript code changes" --search-index .skillrouter/public-search-index.json --max 20
skillrouter recommend "review GitHub PR TypeScript code changes" --search-index .skillrouter/public-search-index.json --search-max 50 --candidate-pack
```

The artifact uses schema `skillrouter.search-index/v1` and includes source
fingerprints for fresh/stale checks; see
[Persistent Search Index](persistent-search-index.md).

## Future Backends

The current implementation supports both in-memory search and a dependency-free
persistent JSON search index. The same `skillrouter.search/v1` result shape can
later be backed by:

- SQLite FTS5 for persistent local keyword search
- sqlite-vec or LanceDB for local vector search
- Qdrant, OpenSearch, or Meilisearch for team-scale hosted search
- prebuilt public search shards published beside static index snapshots
