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
  api/          Optional cloud or self-hosted API.
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
skillrouter recommend "帮我生成一份产品发布 PPT" --candidate-pack --json
skillrouter recommend "帮我生成一份产品发布 PPT" --model-rerank rerank.json
skillrouter recommend "请审查 GitHub PR 中的 TypeScript 代码变更" --scoring scoring.json
skillrouter catalog build --index .skillrouter/index.json --out .skillrouter/catalog.json
skillrouter catalog analyze --index .skillrouter/index.json --markdown .skillrouter/catalog-analysis.md
skillrouter index-source ./skillrouter.source.yaml --out ./public/index
skillrouter source add ./public/index public --mirror https://mirror.example.com/index/
skillrouter source health public
skillrouter recommend "帮我生成一份产品发布 PPT" --source public
skillrouter recommend "review GitHub PR TypeScript code changes" --source public --search-prefilter --search-max 50
skillrouter search "review GitHub PR TypeScript code changes" --source public --max 20
skillrouter catalog build --source public --json
skillrouter catalog analyze --source public --json
skillrouter source add https://lisiqi1983.github.io/open-skill-router/open-skill-router/public-seed/index/ public-seed
skillrouter catalog analyze --source public-seed --json
open-skill-router-api serve --source ./public/index --port 8765
skillrouter recommend "帮我生成一份产品发布 PPT" --api http://127.0.0.1:8765
skillrouter inspect github:owner/repo/skills/example@main
skillrouter install github:owner/repo/skills/example@main --agent generic --scope user
skillrouter list
skillrouter update --check
skillrouter update --safe
skillrouter pin github:owner/repo/skills/example@main
skillrouter serve-mcp
```

## Development Status

M0.5 through M11 paths are implemented for local and GitHub skill sources. The
current runtime can parse `SKILL.md`, build a local index, generate candidate
packs with model-rerank contracts, merge caller-provided model rerank JSON with
deterministic scores, preserve safety gates, publish static JSONL snapshots with
checksums, read named local or remote snapshot sources with mirror failover,
cache remote static snapshots locally, diagnose source health, serve optional
HTTP recommendations and feedback, inspect skill sources, install skills into a
local cache and generic agent target, write lockfiles, infer permissions, score
risk, check updates, apply safe updates, expose the same flow to local agents
through MCP tools, build verified release bundles for GitHub Releases and static
mirrors, and generate a unified multidimensional catalog for local or remote
skills, and analyze catalog coverage, sparse dimensions, tensor-style matrix
slices, and compact skill profiles for local or remote sources. Recommendation
now uses catalog-aware multidimensional scoring across
metadata, intent, domain, input/output, environment, workflow stage, quality, and
safety signals, and these scoring weights can be configured per CLI/API/MCP
request. Real Skill research now has a local-only curation track, a public seed
manifest, research-mode invalid Skill skipping for noisy local inventories, and
a large-scale search path that performs lexical, semantic, catalog, quality, and
safety scoring before model rerank. Recommendation can now use search as a
prefiltered candidate pool for large Skill indexes.

Try it locally:

```bash
pnpm install
pnpm build
node apps/cli/dist/index.js index examples/mock-skills
node apps/cli/dist/index.js recommend "帮我生成一份产品发布 PPT"
node apps/cli/dist/index.js recommend "请审查 GitHub PR 中的 TypeScript 代码变更，找 bug 和缺测试，输出 markdown" --json
node apps/cli/dist/index.js recommend "请审查 GitHub PR 中的 TypeScript 代码变更" --scoring scoring.json --json
node apps/cli/dist/index.js recommend "分析专利交底书，评估授权概率，输出 PDF 报告" --candidate-pack --json
node apps/cli/dist/index.js recommend "帮我生成一份产品发布 PPT" --model-rerank rerank.json --json
node apps/cli/dist/index.js catalog build --index .skillrouter/index.json --out .skillrouter/catalog.json
node apps/cli/dist/index.js catalog analyze --index .skillrouter/index.json --markdown .skillrouter/catalog-analysis.md
node apps/cli/dist/index.js index-source skillrouter.source.yaml --out public/open-skill-router/index
node apps/cli/dist/index.js source add public/open-skill-router/index public --mirror https://mirror.example.com/open-skill-router/index/
node apps/cli/dist/index.js source health public
node apps/cli/dist/index.js recommend "帮我生成一份产品发布 PPT" --source public
node apps/cli/dist/index.js recommend "review GitHub PR TypeScript code changes" --source public --search-prefilter --search-max 50
node apps/cli/dist/index.js search "review GitHub PR TypeScript code changes" --source public --max 20
node apps/cli/dist/index.js catalog build --source public --json
node apps/cli/dist/index.js catalog analyze --source public --json
node apps/cli/dist/index.js index-source skillrouter.public-seed.yaml --out public/open-skill-router/public-seed/index
node apps/cli/dist/index.js index C:/Users/example/.codex/skills --out .skillrouter/local-index.json --skip-invalid
node apps/api/dist/index.js serve --source public/open-skill-router/index --port 8765
node apps/cli/dist/index.js recommend "帮我生成一份产品发布 PPT" --api http://127.0.0.1:8765
pnpm test:release
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

The M3/M3.5 MCP tools are `recommend_skills`, `inspect_skill`, `install_skill`,
`load_skill`, `update_skill`, and `record_feedback`. `recommend_skills` can
return a candidate pack for the caller's model or accept a `model_rerank` object
and return merged final recommendations.

Run checks:

```bash
pnpm typecheck
pnpm test
pnpm test:smoke
pnpm test:mcp
pnpm test:static
pnpm test:api
pnpm test:release
pnpm test:catalog
pnpm test:multidim
pnpm test:scoring
pnpm test:analysis
pnpm test:search
pnpm test:recommend-search
pnpm build
```

See:

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Security and Privacy](docs/security-privacy.md)
- [User Data Directories](docs/user-data-directories.md)
- [Local Entry Skill](docs/local-entry-skill.md)
- [MCP Tools](docs/mcp-tools.md)
- [HTTP API](docs/api.md)
- [Release Packaging](docs/release.md)
- [Unified Skill Catalog](docs/skill-catalog.md)
- [Catalog Analysis](docs/catalog-analysis.md)
- [Recommendation Scoring](docs/scoring.md)
- [Model-Assisted Recommendation](docs/model-assisted-recommendation.md)
- [Large-Scale Skill Search](docs/large-scale-search.md)
- [GitHub Deployment and Mirrors](docs/github-deployment-and-mirrors.md)
- [Public Skill Seed](docs/public-skill-seed.md)
