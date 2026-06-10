# MCP Server

The MCP server exposes Open Skill Router to local agents.

Implemented tools:

- `recommend_skills`
- `inspect_skill`
- `install_skill`
- `load_skill`
- `update_skill`
- `record_feedback`

The server calls the same core/cache/security modules used by the CLI. MCP is a
transport layer, not a separate install path.

`recommend_skills` supports the M3.5 model-assisted loop: callers can request a
candidate pack, run their own model over the bounded candidates, then call
`recommend_skills` again with `model_rerank` to get merged final
recommendations.

## Local Run

Build the workspace:

```bash
pnpm build
```

Start over stdio:

```bash
node apps/mcp-server/dist/index.js
```

The CLI also exposes the same server:

```bash
node apps/cli/dist/index.js serve-mcp
```

## Tests

```bash
pnpm --filter @openskillrouter/mcp-server test
pnpm test:mcp
```

The package test uses the MCP SDK in-memory transport. `pnpm test:mcp` starts a
real stdio server process and verifies tool listing plus a `recommend_skills`
call.

## Tool Handler Boundary

`src/server.ts` owns MCP schemas and tool registration.
`src/toolHandlers.ts` owns router behavior and can be tested without MCP
transport.
