# Roadmap

The roadmap is milestone-based. Each milestone should be shippable and tested.

## M0: Local PoC

Goal: recommend skills from a local directory without cloud services.

Deliverables:

- Monorepo scaffold.
- `SKILL.md` parser.
- Local directory discovery for `**/SKILL.md`.
- GitHub locator parser.
- Local index storage.
- Basic lexical recommendation.
- `skillrouter index`.
- `skillrouter recommend`.
- Mock skills and integration tests.

Acceptance:

```bash
skillrouter index ./examples/mock-skills
skillrouter recommend "帮我生成 PPT"
```

The CLI returns top candidates with score, reason, source, and risk.

## M1: GitHub Install and Cache

Goal: install a selected skill from GitHub into the local cache.

Deliverables:

- GitHub fetch adapter.
- Ref-to-commit resolution.
- Skill folder download.
- Content hash.
- Cache layout.
- Global and project lockfile support.
- `skillrouter inspect`.
- `skillrouter install`.
- `skillrouter list`.

Acceptance:

```bash
skillrouter install github:owner/repo/skills/example@main --agent generic --scope user
skillrouter list
```

The installed skill records source URL, locator, commit SHA, content hash, cache
path, install scope, and target agent.

## M2: Risk Scan and Update

Goal: make installs and updates safe by default.

Deliverables:

- File list scanner.
- Script detection.
- Permission inference.
- Risk scorer.
- Update checker.
- Permission diff classifier.
- `skillrouter update --check`.
- `skillrouter update --safe`.
- `skillrouter pin`.

Acceptance:

- Documentation-only updates can be marked safe.
- New scripts or expanded permissions require confirmation.
- Source changes or hash anomalies block automatic update.

## M3: MCP Server

Goal: expose the router to local agents.

Deliverables:

- `skillrouter serve-mcp`.
- `recommend_skills`.
- `inspect_skill`.
- `install_skill`.
- `load_skill`.
- `update_skill`.
- `record_feedback`.

Acceptance:

An MCP client can call `recommend_skills`, inspect the result, and install a
selected skill through the same safety checks as the CLI.

## M4: Static Index Publishing

Goal: publish reusable skill metadata without operating a database service.

Deliverables:

- Indexer app.
- `skillrouter.source.yaml` ingestion.
- JSONL snapshot output.
- Checksums.
- GitHub Actions scheduled indexing.
- GitHub Pages publishing.
- CLI support for remote snapshot sources.

Acceptance:

```bash
skillrouter source add https://example.com/open-skill-router/index/skills.jsonl
skillrouter recommend "分析专利交底书" --source public
```

## M5: Cloud or Self-Hosted API

Goal: add an optional API for teams that want shared indexing and feedback.

Deliverables:

- HTTP API.
- PostgreSQL schema.
- Optional vector search.
- Feedback endpoint.
- Privacy-preserving task metadata model.

Acceptance:

The CLI can call an API endpoint for recommendations while still supporting
strict local mode.

