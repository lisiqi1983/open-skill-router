# HTTP API

The HTTP API is optional. It is useful for teams that want a shared endpoint for
static-source recommendation and anonymous feedback. Local CLI/MCP use remains
the default path for sensitive tasks.

## Run Locally

```bash
pnpm build
node apps/api/dist/index.js serve --source public/open-skill-router/index --port 8765
```

With a prebuilt persistent search index:

```bash
node apps/api/dist/index.js serve --search-index .skillrouter/search-index.json --port 8765
```

CLI client:

```bash
skillrouter recommend "帮我生成一份产品发布 PPT" --api http://127.0.0.1:8765
```

`strict_local` recommendations are rejected on the API path.

## Endpoints

### `GET /health`

Returns service health:

```json
{
  "schemaVersion": "skillrouter.api-health/v1",
  "status": "ok",
  "service": "open-skill-router-api"
}
```

### `POST /v1/recommend`

Input:

```json
{
  "task": "帮我生成一份产品发布 PPT",
  "source": "public",
  "max_results": 5,
  "recommendation_mode": "fast_metadata",
  "include_candidate_pack": false,
  "search_prefilter": true,
  "search_max_results": 50,
  "scoring": {
    "schemaVersion": "skillrouter.scoring/v1",
    "weights": {
      "domainFit": 2,
      "inputOutputFit": 1
    }
  }
}
```

Returns the same recommendation result shape as the local core runtime.
The optional `scoring` object uses the same schema as
[Recommendation Scoring](scoring.md).
Set `search_prefilter` to true when the API should first retrieve a bounded
candidate pool from large static sources before deterministic recommendation.
`search_max_results` controls the prefilter size. If the API server was started
with `--search-index`, the server-side persistent index is used for this
prefilter; clients cannot provide arbitrary server file paths in request bodies.

### `GET /v1/sources/health?source=public`

Returns source and mirror health using the same checksum validation as the CLI.

### `POST /v1/feedback`

Input:

```json
{
  "skill_id": "local:presentation-deck",
  "accepted": true,
  "task_completed": true,
  "rating": 5,
  "anonymous_tags": {
    "scenario": "presentation"
  }
}
```

Feedback is stored as JSONL by the self-hosted API. Task text is intentionally
not persisted.

## Privacy Model

The API may receive task text for recommendation, so users should use it only
for team-approved or non-sensitive tasks. For sensitive tasks, use the local CLI
or MCP path with `strict_local`.

Feedback persistence avoids raw task content. Store only skill IDs,
recommendation IDs, coarse tags, ratings, and optional user-supplied comments.

## Database Path

The M5 server is file/static-source backed by default. A PostgreSQL schema for a
future shared deployment is available at
`apps/api/schema/postgres.sql`, including an optional pgvector extension point.
