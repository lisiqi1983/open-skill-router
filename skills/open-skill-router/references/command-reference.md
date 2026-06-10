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
```

Use `--candidate-pack --json` when the calling model should compare bounded
candidate skill documents. After the model produces JSON matching the candidate
pack's `rerankContract.outputSchema`, pass it back with `--model-rerank`.

Build and use a static source:

```bash
skillrouter index-source ./skillrouter.source.yaml --out ./public/index
skillrouter source add ./public/index public --mirror https://mirror.example.com/index/
skillrouter source list
skillrouter source health public
skillrouter recommend "帮我生成一份产品发布 PPT" --source public
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
```

Catalogs summarize skills into shared dimensions: domains, intents, inputs,
outputs, environments, workflow stages, languages, risk levels, and source
types.

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
