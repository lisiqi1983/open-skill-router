# API

The API app is an optional self-hosted HTTP surface for teams that want shared
recommendation and feedback without forcing every client to fetch indexes
directly.

The default deployment still remains local-first: CLI/MCP can use static
snapshots directly. Run this app only when a team wants a shared HTTP endpoint.

## Run

```bash
pnpm build
node apps/api/dist/index.js serve --source public/open-skill-router/index --port 8765
```

Then call:

```bash
curl http://127.0.0.1:8765/health
curl -X POST http://127.0.0.1:8765/v1/recommend \
  -H "content-type: application/json" \
  -d '{"task":"帮我生成一份产品发布 PPT"}'
```

The CLI can call the API:

```bash
node apps/cli/dist/index.js recommend "帮我生成一份产品发布 PPT" --api http://127.0.0.1:8765
```

`strict_local` recommendations are rejected by the API path and should run in the
local CLI/MCP runtime.

## Endpoints

- `GET /health`
- `GET /v1/sources/health?source=public`
- `POST /v1/recommend`
- `POST /v1/feedback`

Feedback is appended to JSONL and intentionally does not persist task text.
