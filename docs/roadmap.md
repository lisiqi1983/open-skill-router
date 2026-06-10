# Roadmap

The roadmap is milestone-based. Each milestone should be shippable and tested.

## M0: Local PoC

Goal: recommend skills from a local directory without cloud services.

Deliverables:

- [x] Monorepo scaffold.
- [x] `SKILL.md` parser.
- [x] Local directory discovery for `**/SKILL.md`.
- [x] GitHub locator parser.
- [x] Local index storage.
- [x] Basic lexical recommendation.
- [x] Candidate pack data model.
- [x] `skillrouter index`.
- [x] `skillrouter recommend`.
- [x] Mock skills and integration tests.

Acceptance:

```bash
skillrouter index ./examples/mock-skills
skillrouter recommend "帮我生成 PPT"
```

The CLI returns top candidates with score, reason, source, and risk.

## M0.5: Universal Entry Skill

Goal: make Open Skill Router available to agents as a normal skill-shaped entry
point while delegating real work to CLI/MCP runtime code.

Deliverables:

- [x] `skills/open-skill-router/SKILL.md`.
- [x] Entry skill references for recommendation policy, command reference, and install safety.
- [x] `skillrouter init` for installing the entry skill into a target agent.
- [x] Generic agent-host adapter target for Agent Skills-compatible directories.

Acceptance:

An agent with the entry skill installed can discover that it should call
SkillRouter when the user asks for skill discovery, skill installation, or a task
that appears to need a specialized skill.

## M1: GitHub Install and Cache

Goal: install a selected skill from GitHub into the local cache.

Deliverables:

- [x] GitHub fetch adapter.
- [x] Ref-to-commit resolution.
- [x] Skill folder download.
- [x] Content hash.
- [x] Cache layout.
- [x] Global and project lockfile support.
- [x] `skillrouter inspect`.
- [x] `skillrouter install`.
- [x] `skillrouter list`.

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

- [x] File list scanner.
- [x] Script detection.
- [x] Permission inference.
- [x] Risk scorer.
- [x] Update checker.
- [x] Permission diff classifier.
- [x] `skillrouter update --check`.
- [x] `skillrouter update --safe`.
- [x] `skillrouter pin`.

Acceptance:

- Documentation-only updates can be marked safe.
- New scripts or expanded permissions require confirmation.
- Source changes or hash anomalies block automatic update.

## M3: MCP Server

Goal: expose the router to local agents.

Deliverables:

- [x] `skillrouter serve-mcp`.
- [x] `recommend_skills`.
- [x] `inspect_skill`.
- [x] `install_skill`.
- [x] `load_skill`.
- [x] `update_skill`.
- [x] `record_feedback`.
- [x] MCP protocol unit test with in-memory transport.
- [x] Stdio smoke test with a real MCP client and server process.

Acceptance:

An MCP client can call `recommend_skills`, inspect the result, and install a
selected skill through the same safety checks as the CLI.

Status: implemented in `apps/mcp-server` and exposed through
`skillrouter serve-mcp`.

## M3.5: Model-Assisted Rerank

Goal: let the user's current model compare bounded candidate skill documents
while deterministic code still owns safety and installation.

Deliverables:

- `RecommendationMode`: `fast_metadata`, `full_skill_rerank`, and `strict_local`.
- `CandidatePack` schema with bounded `SKILL.md` excerpts, file tree, permissions, and risk summary.
- JSON-schema rerank output contract.
- Prompt injection guardrails for untrusted candidate skill documents.
- Score merging between deterministic ranking and model rerank.

M3 already exposes candidate packs through `recommend_skills` when callers set
`include_candidate_pack`. M3.5 will make the model-rerank loop first-class in
the router runtime instead of leaving rerank execution to the calling agent.

Acceptance:

`recommend_skills` can return either final recommendations or a candidate pack
that the calling agent can rerank, and the final recommendation still passes the
same security gate before installation.

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
