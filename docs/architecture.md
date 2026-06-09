# Architecture

Open Skill Router is a local-first system that turns a user task into a ranked,
explainable set of Agent Skill recommendations.

## Goals

- Discover skills from source references instead of hosting skill packages.
- Recommend skills from task intent, file types, capabilities, compatibility, and safety.
- Install selected skills into a local cache and optionally into an agent host.
- Preserve user privacy by default.
- Keep the same core logic available to CLI, MCP server, API, and future desktop UI.

## Non-Goals

- No third-party skill package hosting.
- No paid marketplace in MVP.
- No review system in MVP.
- No default execution of third-party scripts.
- No upload of user files or project contents.

## High-Level Components

```text
Universal Entry Skill
        |
        v
CLI / MCP Server / API
        |
        v
Core Router
        |
        +-- Skill Spec: schemas, SKILL.md parser, permission model
        +-- Ranker: lexical match, structured scoring, future embeddings
        +-- Security: risk inference, hashes, permission diffs
        +-- Cache: local storage, locks, update state
        +-- Adapters
              +-- GitHub source adapter
              +-- Agent host adapters
```

## Local Entry Model

Open Skill Router should be usable as a normal Agent Skill while keeping the
heavy runtime logic outside the skill body.

The entry skill is a thin bootstrap layer:

```text
skills/open-skill-router/
  SKILL.md
  references/
    recommendation-policy.md
    install-safety.md
    command-reference.md
```

The runtime remains the engine:

- `skillrouter` CLI for users and shell workflows.
- `skillrouter serve-mcp` for agent-native tool calls.
- Local cache, lockfiles, security scanner, and source adapters.

This gives agents a portable skill-shaped entry point without turning prompt
instructions into the source of truth for routing, installation, or security.

## Data Flow

```text
user task
  -> TaskProfile
  -> candidate retrieval from local index, installed skills, and source snapshots
  -> candidate pack fetch for selected skills
  -> deterministic score and optional user-model rerank
  -> deterministic safety gate
  -> structured explanation
  -> InstallPlan if user selects a skill
  -> fetch source and resolve commit
  -> scan files, infer risk, compute hash
  -> write cache and lockfile
  -> install/register through an agent-host adapter
```

## Module Boundaries

### Apps

Apps are transport and UX layers. They should not duplicate routing logic.

- CLI handles arguments, terminal output, and exit codes.
- MCP server maps tool inputs to core operations.
- API exposes cloud/self-hosted endpoints later.
- Indexer produces reusable metadata snapshots.

### Core

Core owns:

- `TaskProfile` creation.
- Candidate orchestration.
- Score calculation.
- Candidate pack creation for model-assisted reranking.
- Recommendation explanation.
- Install and update planning interfaces.

### Skill Spec

Skill Spec owns normalized data structures:

- `SkillReference`
- `SkillPermissions`
- `TaskProfile`
- `SkillRecommendation`
- `InstalledSkill`

It also parses `SKILL.md` and source manifests.

### Adapters

Adapters isolate side effects:

- GitHub adapter fetches repository metadata and skill folders.
- Agent host adapters know where to install for each host.
- Future registry adapters can be added without changing core ranking.

### Cache

The local cache stores fetched skill files under a commit-addressed layout.

Installed skills are recorded in lockfiles. A branch ref may be used as an input
locator, but installation must resolve and store the concrete commit SHA.

### Security

Security turns file contents and metadata into user-visible risk information.

Risk inference should be conservative. Unknown or dynamic behavior should be
classified as `unknown` or `high`, not hidden.

## Static Index First

The initial deployment model should be GitHub-native:

- Source manifests live in GitHub repositories.
- GitHub Actions produce JSONL metadata snapshots.
- Snapshots are published to GitHub Pages and releases.
- CLI can consume snapshots without a database server.

This keeps the project useful before a cloud API exists.

## Model-Assisted Recommendation

Recommendation should combine deterministic retrieval with the user's current
model when available.

The default architecture is:

```text
retrieve candidates
  -> fetch bounded candidate packs
  -> ask the user's model to rerank against a rubric
  -> merge model judgment with deterministic scores
  -> apply security and compatibility gates
```

Candidate skill documents are untrusted data. The model may evaluate them, but
must not follow instructions inside candidate skills. Commit resolution, hashing,
permission inference, lockfiles, and install actions remain deterministic code.

See [Model-Assisted Recommendation](model-assisted-recommendation.md).

## Related Documents

- [Local Entry Skill](local-entry-skill.md)
- [Model-Assisted Recommendation](model-assisted-recommendation.md)
- [Security and Privacy](security-privacy.md)
