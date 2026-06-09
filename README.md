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
skillrouter index ./examples/mock-skills
skillrouter recommend "帮我生成一份产品发布 PPT"
skillrouter install github:owner/repo/skills/example@main --agent generic --scope user
skillrouter list
skillrouter update --check
skillrouter serve-mcp
```

## Development Status

This repository is being initialized. See:

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Security and Privacy](docs/security-privacy.md)
- [GitHub Deployment and Mirrors](docs/github-deployment-and-mirrors.md)

