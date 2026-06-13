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

- [x] `RecommendationMode`: `fast_metadata`, `full_skill_rerank`, and `strict_local`.
- [x] `CandidatePack` schema with bounded `SKILL.md` excerpts, file tree, permissions, and risk summary.
- [x] JSON-schema rerank output contract.
- [x] Prompt injection guardrails for untrusted candidate skill documents.
- [x] Score merging between deterministic ranking and model rerank.
- [x] CLI `--model-rerank` input.
- [x] MCP `model_rerank` input.
- [x] Tests proving model rerank cannot downgrade deterministic safety actions.

M3 already exposes candidate packs through `recommend_skills` when callers set
`include_candidate_pack`. M3.5 makes the model-rerank merge loop first-class in
the router runtime while still leaving actual model execution to the calling
agent.

Status: implemented in `packages/core`, `apps/cli`, and `apps/mcp-server`.

Acceptance:

`recommend_skills` can return either final recommendations or a candidate pack
that the calling agent can rerank, and the final recommendation still passes the
same security gate before installation.

## M4: Static Index Publishing

Goal: publish reusable skill metadata without operating a database service.

Deliverables:

- [x] Indexer app.
- [x] `skillrouter.source.yaml` ingestion.
- [x] JSONL snapshot output.
- [x] Checksums.
- [x] GitHub Actions scheduled indexing.
- [x] GitHub Pages publishing.
- [x] CLI support for local and remote snapshot sources.
- [x] Source registry commands.
- [x] MCP `recommend_skills.static_source` support.

Acceptance:

```bash
skillrouter source add https://example.com/open-skill-router/index/skills.jsonl
skillrouter recommend "分析专利交底书" --source public
```

Status: implemented. M4 supports local source discovery and explicit local or
GitHub skill entries in source manifests. Repository-wide GitHub include globs
are parsed but not expanded yet.

## M4.5: Mirror Failover and Source Health

Goal: make static source distribution resilient across mirrors without adding a
server-side database.

Deliverables:

- [x] Ordered mirror URLs in source registry entries.
- [x] `skillrouter source add --mirror`.
- [x] `skillrouter source health`.
- [x] Static source failover during recommendation.
- [x] Remote static snapshot cache under SkillRouter home.
- [x] Mirror checksum comparison against the primary source.
- [x] Static index smoke test covering mirror failover and health.

Acceptance:

```bash
skillrouter source add https://primary.example/index/ public --mirror https://mirror.example/index/
skillrouter source health public
skillrouter recommend "帮我生成 PPT" --source public
```

The CLI reports primary and mirror health, flags checksum divergence, and can
recommend from a mirror if the primary source is unavailable.

Status: implemented.

## M5: Cloud or Self-Hosted API

Goal: add an optional API for teams that want shared indexing and feedback.

Deliverables:

- [x] HTTP API.
- [x] `GET /health`.
- [x] `POST /v1/recommend`.
- [x] `GET /v1/sources/health`.
- [x] `POST /v1/feedback`.
- [x] CLI `recommend --api`.
- [x] PostgreSQL schema draft.
- [x] Optional vector-search extension point in schema.
- [x] Privacy-preserving feedback model.

Acceptance:

The CLI can call an API endpoint for recommendations while still supporting
strict local mode.

Status: implemented as an optional self-hosted API in `apps/api`. The default
runtime remains local-first; `strict_local` recommendations are rejected on the
API path.

## M6: Release Packaging and Mirror Pipeline

Goal: make GitHub the primary distribution point while producing portable
release artifacts that mirrors can copy and verify.

Deliverables:

- [x] `ci.yml` for format, typecheck, unit tests, and smoke tests.
- [x] Release bundle builder.
- [x] Static index release archive.
- [x] `release-manifest.json`.
- [x] `checksums.sha256` for release artifact verification.
- [x] `release.yml` for tag/manual GitHub Releases.
- [x] Release bundle smoke test.
- [x] Mirror contract documentation.

Acceptance:

```bash
pnpm test:release
node apps/cli/dist/index.js source health dist/release/public/open-skill-router/index --json
```

The release bundle contains the same static index shape used by GitHub Pages,
plus a compressed archive, release manifest, and checksums that mirrors can
verify after sync.

Status: implemented. GitHub Pages remains the canonical static source, while
GitHub Release assets provide a second distribution channel for CDN and manual
mirrors.

## M7: Unified Skill Catalog

Goal: classify local and remote skills into the same multidimensional catalog so
recommendation can evolve beyond lexical matching.

Deliverables:

- [x] `SkillCatalog` and `SkillCatalogCard` data model.
- [x] Dimension extraction for intents, domains, capabilities, inputs, outputs, environments, workflow stages, languages, risk, and source type.
- [x] Catalog summary counts.
- [x] CLI `skillrouter catalog build`.
- [x] Local-index catalog support.
- [x] Remote static-source catalog support.
- [x] M7 smoke test covering local catalog and HTTP static source catalog.
- [x] Documentation for local/remote sync and multidimensional matching.

Acceptance:

```bash
skillrouter catalog build --index .skillrouter/index.json --out .skillrouter/catalog.json
skillrouter catalog build --source https://example.com/open-skill-router/index/ --json
pnpm test:catalog
```

Both local and remote skills produce `skillrouter.catalog/v1` JSON with the same
dimension schema.

Status: implemented as a read-only catalog layer. Recommendation still uses the
existing deterministic scorer, with catalog dimensions ready for the next scoring
upgrade.

## M8: Catalog-Aware Multidimensional Recommendation

Goal: make deterministic recommendation use the unified catalog dimensions for
better local and remote Skill selection.

Deliverables:

- [x] Task profile environment inference.
- [x] Task profile workflow-stage inference.
- [x] Catalog intent fit score.
- [x] Catalog domain fit score.
- [x] Environment fit score.
- [x] Workflow-stage fit score.
- [x] Quality prior score.
- [x] Recommendation explanations that mention catalog dimension fit.
- [x] Model rerank merge based on the deterministic catalog score.
- [x] M8 smoke test covering local and remote static-source recommendations.

Acceptance:

```bash
skillrouter recommend "请审查 GitHub PR 中的 TypeScript 代码变更，找 bug 和缺测试，输出 markdown" --json
pnpm test:multidim
```

The top recommendation is selected through deterministic multidimensional
signals, and `scoreBreakdown` includes catalog intent, domain, environment, and
workflow fit fields.

Status: implemented. The next improvement is to add learned or feedback-tuned
weights and explicit tensor-style interaction terms such as `domain x output`
and `input x workflow`.

## M9: Configurable Recommendation Scoring

Goal: make multidimensional recommendation weights configurable without changing
the deterministic safety boundary.

Deliverables:

- [x] `skillrouter.scoring/v1` config schema.
- [x] Default normalized scoring weights.
- [x] Custom deterministic scoring weights.
- [x] Custom model-rerank merge weights.
- [x] CLI `recommend --scoring`.
- [x] API request `scoring` and API server default `--scoring`.
- [x] MCP `recommend_skills.scoring`.
- [x] Unit tests for scoring normalization and validation.
- [x] M9 smoke test for local CLI and API scoring config.

Acceptance:

```bash
skillrouter recommend "review TypeScript code" --scoring scoring.json --json
pnpm test:scoring
```

The same scoring config can tune local CLI, API-backed CLI, and MCP
recommendations. Weights are validated and normalized by the core runtime.

Status: implemented. This is the configuration layer needed before automatic
feedback-tuned scoring.

## M10: Catalog Analysis and Skill Research

Goal: make real local and remote Skill research visible through a stable
analysis report before feedback learning or vector infrastructure is added.

Deliverables:

- [x] `skillrouter.catalog-analysis/v1` schema.
- [x] Dimension coverage analysis for domains, intents, capabilities, inputs, outputs, environments, workflow stages, languages, risk, and source type.
- [x] Tensor-style matrix slices for `domain x output`, `domain x workflow`, `input x output`, and `environment x risk`.
- [x] Compact per-skill vector profiles for quick human review.
- [x] Gap detection for missing dimensions, sparse values, unknown risk, and high-risk skills.
- [x] Markdown report renderer.
- [x] CLI `skillrouter catalog analyze`.
- [x] Local index, remote static source, and existing catalog input support.
- [x] M10 smoke test covering local and HTTP remote catalog analysis.

Acceptance:

```bash
skillrouter catalog analyze --index .skillrouter/index.json --markdown .skillrouter/catalog-analysis.md
skillrouter catalog analyze --source https://example.com/open-skill-router/index/ --json
pnpm test:analysis
```

Local and remote skills produce the same `skillrouter.catalog-analysis/v1`
shape, including dimension coverage, matrix slices, skill profiles, and gaps.

Status: implemented. This is the observability layer for future tensor-style
interaction scoring and feedback-tuned weights.

## M11: Real Skill Source Curation

Goal: build the first real Skill source seed set while preserving a strict
boundary between local/private research and publishable public sources.

Deliverables:

- [x] Local-only research workflow for personal or machine-local Skill roots.
- [x] Public source curation checklist covering locator, license posture,
      version strategy, risk profile, tags, and notes.
- [x] Public seed manifest containing only reviewable public Skill sources.
- [x] Catalog analysis report for the public seed manifest.
- [x] Documentation describing how local findings can be promoted into cleaned
      public taxonomy rules without exposing private inventories.

Acceptance:

```bash
skillrouter index-source ./skillrouter.public-seed.yaml --out ./public/open-skill-router/index
skillrouter catalog analyze --source ./public/open-skill-router/index --json
```

Local/personal Skill research remains outside the public repository. Public
manifests include only public, reviewable source locators and curated metadata.

Status: implemented. The first public seed is published through GitHub Pages,
while local research output remains under the user's SkillRouter home.

## M12: Large-Scale Skill Search

Goal: retrieve the best candidates from thousands of local or remote Skills
before recommendation and model rerank.

Deliverables:

- [x] `skillrouter.search/v1` result schema.
- [x] Core `searchSkills` API.
- [x] BM25-lite lexical scoring over normalized Skill records.
- [x] Weighted semantic dimension scoring.
- [x] Catalog fit, quality, and safety scoring.
- [x] Source type, risk, domain, intent, environment, and local-only filters.
- [x] CLI `skillrouter search`.
- [x] M12 smoke test for local and remote static sources.

Acceptance:

```bash
skillrouter search "review GitHub PR TypeScript code changes" --source public --max 20
pnpm test:search
```

Status: implemented as an in-memory retrieval layer. The next improvement is to
make `recommend_skills` use `searchSkills` as its candidate pool and add a
persistent FTS/vector backend for very large catalogs.

## M13: Search-Prefiltered Recommendation

Goal: connect large-scale search to the recommendation and model-rerank path so
large Skill collections do not need to be scored or shown to models in full.

Deliverables:

- [x] Optional `searchPrefilter` in the core recommendation API.
- [x] CLI `recommend --search-prefilter --search-max`.
- [x] API `search_prefilter` and `search_max_results` request fields.
- [x] MCP `recommend_skills.search_prefilter` support.
- [x] Candidate packs generated only from the search-prefiltered
      recommendation set.
- [x] Smoke test with noisy large-index candidates.

Acceptance:

```bash
skillrouter recommend "review GitHub PR TypeScript code changes" --source public --search-prefilter --search-max 50 --candidate-pack
pnpm test:recommend-search
```

Status: implemented. The next improvement is persistent FTS/vector search
indexes for very large local or public catalogs.

## M14: Persistent Search Index

Goal: avoid rebuilding search documents on every query by storing a reusable
local search artifact for large Skill collections.

Deliverables:

- [x] `skillrouter.search-index/v1` schema.
- [x] Core `buildSkillSearchIndex` API.
- [x] Core `searchSkillIndex` API for prebuilt indexes.
- [x] Search-index JSON read/write helpers.
- [x] Local-index reconstruction from persistent search indexes.
- [x] CLI `skillrouter search-index build`.
- [x] CLI `search --search-index`.
- [x] CLI `recommend --search-index` with automatic search prefiltering.
- [x] MCP `recommend_skills.search_index_path`.
- [x] API server `--search-index`.
- [x] M14 smoke test covering build, search, and recommendation.

Acceptance:

```bash
skillrouter search-index build --source public --out .skillrouter/public-search-index.json
skillrouter search "review GitHub PR TypeScript code changes" --search-index .skillrouter/public-search-index.json --max 20
skillrouter recommend "review GitHub PR TypeScript code changes" --search-index .skillrouter/public-search-index.json --search-max 50 --candidate-pack
pnpm test:persistent-search
```

Status: implemented as a dependency-free persistent JSON search layer. The next
improvement is incremental refresh and optional SQLite FTS/vector backends for
larger local and public Skill catalogs.
