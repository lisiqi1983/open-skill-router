# Command Reference

Index local skills:

```bash
skillrouter index ./examples/mock-skills
```

Recommend skills:

```bash
skillrouter recommend "帮我生成一份产品发布 PPT"
skillrouter recommend "分析专利交底书，评估授权概率，输出 PDF 报告" --candidate-pack --json
skillrouter recommend "帮我生成一份产品发布 PPT" --model-rerank rerank.json --json
skillrouter recommend "请审查 GitHub PR 中的 TypeScript 代码变更" --scoring scoring.json --json
skillrouter recommend "review GitHub PR TypeScript code changes" --source public --search-prefilter --search-max 50 --candidate-pack
```

Search large local or remote Skill indexes before model rerank:

```bash
skillrouter search "review GitHub PR TypeScript code changes" --source public --max 20
skillrouter search "generate product launch slides" --index .skillrouter/index.json --domain presentation --risk medium
skillrouter search "local PDF report writing" --local-only --environment local_filesystem --json
```

Build and reuse a persistent search index for large Skill collections:

```bash
skillrouter search-index build --source public --out .skillrouter/public-search-index.json
skillrouter search-index status --source public --search-index .skillrouter/public-search-index.json
skillrouter search-index build --source public --out .skillrouter/public-search-index.json --if-stale --incremental
skillrouter search "review GitHub PR TypeScript code changes" --search-index .skillrouter/public-search-index.json --max 20
skillrouter recommend "review GitHub PR TypeScript code changes" --search-index .skillrouter/public-search-index.json --search-max 50 --candidate-pack
```

Use `--candidate-pack --json` when the calling model should compare bounded
candidate skill documents. After the model produces JSON matching the candidate
pack's `rerankContract.outputSchema`, pass it back with `--model-rerank`.

Build and use a static source:

```bash
skillrouter index-source ./skillrouter.source.yaml --out ./public/index
skillrouter index-source ./skillrouter.public-seed.yaml --out ./public/open-skill-router/public-seed/index
skillrouter source add ./public/index public --mirror https://mirror.example.com/index/
skillrouter source list
skillrouter source health public
skillrouter recommend "帮我生成一份产品发布 PPT" --source public
```

Use the public seed after GitHub Pages is enabled:

```bash
skillrouter source add https://lisiqi1983.github.io/open-skill-router/open-skill-router/public-seed/index/ public-seed
skillrouter source health public-seed
skillrouter catalog analyze --source public-seed --json
skillrouter recommend "review a GitHub PR and address comments" --source public-seed
```

During local-only research, skip malformed local Skills without editing them:

```bash
skillrouter index ./some-skill-root --out ./tmp/index.json --skip-invalid
skillrouter index-source ./local-source.yaml --out ./tmp/index --skip-invalid
```

Use the optional API for team-shared recommendation:

```bash
open-skill-router-api serve --source ./public/index --port 8765
skillrouter recommend "帮我生成一份产品发布 PPT" --api http://127.0.0.1:8765
```

Do not use `--api` for `strict_local` tasks.

Build a multidimensional catalog from local or remote skills:

```bash
skillrouter catalog build --index .skillrouter/index.json --out .skillrouter/catalog.json
skillrouter catalog build --source public --json
skillrouter catalog build --source https://example.com/open-skill-router/index/ --json
skillrouter catalog analyze --index .skillrouter/index.json --markdown .skillrouter/catalog-analysis.md
skillrouter catalog analyze --source public --json
```

Catalogs summarize skills into shared dimensions: domains, intents, inputs,
outputs, environments, workflow stages, languages, risk levels, and source
types.

Use `catalog analyze` when the user wants to review real Skill coverage, sparse
metadata, tensor-style dimension interactions, or a human-readable Skill research
report before tuning recommendation weights.

Inspect a skill:

```bash
skillrouter inspect github:owner/repo/skills/example@main
skillrouter inspect local:/path/to/skill
```

Install a skill:

```bash
skillrouter install github:owner/repo/skills/example@main --agent generic --scope user
skillrouter install local:/path/to/skill --target-dir ./tmp/agent-skills
```

List installed skills:

```bash
skillrouter list
```

Check or apply safe updates:

```bash
skillrouter update --check
skillrouter update --safe
```

Initialize the local entry skill:

```bash
skillrouter init --agent generic --scope user
```
