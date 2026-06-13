# MCP Tools

Open Skill Router exposes MCP tools so local agents can discover, inspect,
install, load, update, and give feedback on skills through the same deterministic
safety layer used by the CLI.

## Start the Server

Build first:

```bash
pnpm build
```

Start through the CLI:

```bash
node apps/cli/dist/index.js serve-mcp
```

Or start the MCP app directly:

```bash
node apps/mcp-server/dist/index.js
```

MCP client configuration can point at either command. Example:

```json
{
  "mcpServers": {
    "open-skill-router": {
      "command": "node",
      "args": ["apps/cli/dist/index.js", "serve-mcp"]
    }
  }
}
```

## Tools

### `recommend_skills`

Recommends skills from a local source root or an existing local index.

Input:

```json
{
  "task": "分析这个专利交底书，评估授权概率，输出 PDF 报告",
  "static_source": "public",
  "source_registry": ".skillrouter/sources.json",
  "privacy_mode": "balanced",
  "recommendation_mode": "fast_metadata",
  "max_results": 5,
  "include_candidate_pack": true,
  "search_prefilter": true,
  "search_max_results": 50,
  "scoring": {
    "schemaVersion": "skillrouter.scoring/v1",
    "weights": {
      "catalogIntentFit": 2,
      "environmentFit": 1
    }
  },
  "model_rerank": {
    "schemaVersion": "skillrouter.model-rerank/v1",
    "rankings": [
      {
        "skill_id": "local:presentation-deck",
        "score": 96,
        "reasons": ["Best match for presentation generation."],
        "recommended_action": "install"
      }
    ]
  }
}
```

Notes:

- Use one of `source_root`, `static_source`, or `index_path`.
- `source_root` triggers live discovery of local `SKILL.md` files.
- `static_source` can be a configured source name, local static index
  directory, `skills.jsonl` file, or HTTP(S) static index URL.
- `source_registry` resolves configured names such as `public`; configured
  mirrors are tried in order after the primary URL.
- Remote static sources are cached locally and can be reused after temporary
  network failures.
- `index_path` can be used instead of `source_root`; otherwise the project
  index path is used.
- `include_candidate_pack` defaults the mode to `full_skill_rerank` so the
  caller's model can compare bounded candidate documents.
- `search_prefilter` first retrieves a bounded candidate pool using
  deterministic search. Use it for large local or remote Skill sources before
  returning a candidate pack to the caller's model.
- `search_max_results` controls how many search hits are retained before
  recommendation scoring.
- `model_rerank` lets the caller pass structured model output back to
  SkillRouter. SkillRouter validates it, merges scores, and preserves
  deterministic safety gates.
- `scoring` optionally tunes deterministic recommendation weights using
  `skillrouter.scoring/v1`.
- Supported modes are `fast_metadata`, `full_skill_rerank`, and `strict_local`.

Output includes recommendations, scores, explanations, privacy mode, and
candidate packs when requested. When `model_rerank` is supplied, output also
includes `modelRerank.applied`, validation issues, ignored skill IDs, merged
scores, and `modelRerankScore` on affected recommendations.

The candidate pack contains a `rerankContract` with prompt-injection guardrails
and a JSON Schema for the model's response. Candidate skill documents are
untrusted data; model output can affect fit scoring but cannot authorize
installation or downgrade `inspect_first`/`avoid` safety actions.

### `inspect_skill`

Inspects a local or GitHub skill source without installing it.

Input:

```json
{
  "locator": "local:skills/open-skill-router",
  "scope": "user"
}
```

Output includes parsed skill metadata, resolved source information, file scan,
content hash, inferred permissions, risk level, cache path, lockfile path,
blocked state, and warnings.

### `install_skill`

Installs a selected skill into the local cache and a generic Agent
Skills-compatible target.

Input:

```json
{
  "locator": "local:skills/open-skill-router",
  "agent_host": "generic",
  "scope": "user",
  "pin": false,
  "allow_high_risk": false
}
```

The install path resolves refs, computes content hashes, scans risk, writes the
lockfile, and copies the skill to the configured generic target. High-risk or
blocked plans still require explicit allowance from the caller.

### `load_skill`

Loads an already installed skill from the local lockfile.

Input:

```json
{
  "skill": "local:skills/open-skill-router",
  "scope": "user",
  "max_skill_md_chars": 12000
}
```

Output includes installed metadata, cache path, `SKILL.md` path, bounded
`SKILL.md` content, and a `truncated` flag.

### `update_skill`

Checks for updates or applies only safe updates.

Input:

```json
{
  "action": "check",
  "scope": "user"
}
```

Set `action` to `safe` to apply updates classified as safe by the deterministic
diff and risk logic. Optional `skill` filters by installed skill ID or locator.

### `record_feedback`

Records local recommendation feedback without storing task text.

Input:

```json
{
  "skill_id": "local:skills/open-skill-router",
  "accepted": true,
  "task_completed": true,
  "rating": 5,
  "anonymous_tags": {
    "scenario": "presentation"
  }
}
```

Feedback is appended to `~/.skillrouter/feedback/feedback.jsonl` unless
`home_dir` is supplied.

## Verification

Run the MCP unit and stdio smoke coverage:

```bash
pnpm test:mcp
```

The smoke test starts `apps/mcp-server/dist/index.js` as a real stdio MCP server,
lists the six tools, calls `recommend_skills` against `examples/mock-skills`,
and verifies that caller-provided `model_rerank` output is applied.
