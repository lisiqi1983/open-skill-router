# Open Skill Router

Open Skill Router is a local-first router for Agent Skills.

It does not host skills. Instead, it discovers skills from GitHub repositories,
Agent Skills-compatible folders, MCP registries, and curated source manifests.
Given a user task, it recommends the most relevant skills, explains why, checks
risk and compatibility, then installs the selected skill into the local cache or
an agent host.

## Why

Agent Skills are becoming portable, but discovery is still hard. Users should not
need to know which repository contains the right `SKILL.md`, where to install it,
or whether it is safe. Open Skill Router makes skill discovery task-driven,
explainable, and user-confirmed.

## Product Boundaries

Open Skill Router is a router, not a skill marketplace.

- It does not host third-party skill packages.
- It stores normalized metadata, source references, hashes, risk signals, and optional index snapshots.
- It keeps user files local by default.
- It never executes third-party skill scripts during MVP installation.
- It installs only after showing source, version, file list, risk level, and permission inference.

## Target MVP

The first usable loop is:

```text
user task
  -> local task profile
  -> local index / GitHub source / static index snapshot
  -> ranked skill recommendations
  -> user chooses a skill
  -> GitHub source is fetched and pinned to a commit
  -> local cache + lockfile are written
  -> target agent adapter installs or registers the skill
```

## Repository Layout

```text
apps/
  cli/          Command-line entry point.
  mcp-server/   MCP tools for agents.
  api/          Future cloud or self-hosted API.
  indexer/      GitHub and source manifest index jobs.

packages/
  core/         Task profiling, routing, scoring, and explanations.
  skill-spec/   SKILL.md parsing, schemas, and permission model.
  adapters/     GitHub and agent-host adapters.
  cache/        Local cache, lockfiles, and update checks.
  ranker/       Lexical, embedding, and rerank modules.
  security/     Hashing, permission inference, risk scoring, and diffs.

docs/           Public architecture and operating documents.
```

## Early CLI Shape

```bash
skillrouter init --agent generic --scope user
skillrouter index ./examples/mock-skills
skillrouter recommend "帮我生成一份产品发布 PPT"
skillrouter inspect github:owner/repo/skills/example@main
skillrouter install github:owner/repo/skills/example@main --agent generic --scope user
skillrouter list
skillrouter update --check
skillrouter update --safe
skillrouter pin github:owner/repo/skills/example@main
skillrouter serve-mcp
```

## Development Status

M0.5, M1, M2, and M3 paths are implemented for local and GitHub skill sources.
The current runtime can parse `SKILL.md`, build a local index, generate
candidate packs, inspect skill sources, install skills into a local cache and
generic agent target, write lockfiles, infer permissions, score risk, check
updates, apply safe updates, and expose the same flow to local agents through
MCP tools.

Try it locally:

```bash
pnpm install
pnpm build
node apps/cli/dist/index.js index examples/mock-skills
node apps/cli/dist/index.js recommend "帮我生成一份产品发布 PPT"
node apps/cli/dist/index.js recommend "分析专利交底书，评估授权概率，输出 PDF 报告" --candidate-pack --json
node apps/cli/dist/index.js init --agent generic --scope user
node apps/cli/dist/index.js inspect local:skills/open-skill-router
node apps/cli/dist/index.js install local:skills/open-skill-router --agent generic --scope user
node apps/cli/dist/index.js list
node apps/cli/dist/index.js update --check
node apps/cli/dist/index.js serve-mcp
```

MCP clients can also start the built server directly:

```bash
node apps/mcp-server/dist/index.js
```

The M3 MCP tools are `recommend_skills`, `inspect_skill`, `install_skill`,
`load_skill`, `update_skill`, and `record_feedback`.

Run checks:

```bash
pnpm typecheck
pnpm test
pnpm test:smoke
pnpm test:mcp
pnpm build
```

See:

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Security and Privacy](docs/security-privacy.md)
- [Local Entry Skill](docs/local-entry-skill.md)
- [MCP Tools](docs/mcp-tools.md)
- [Model-Assisted Recommendation](docs/model-assisted-recommendation.md)
- [GitHub Deployment and Mirrors](docs/github-deployment-and-mirrors.md)
