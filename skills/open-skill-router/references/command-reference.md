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
```

Use `--candidate-pack --json` when the calling model should compare bounded
candidate skill documents. After the model produces JSON matching the candidate
pack's `rerankContract.outputSchema`, pass it back with `--model-rerank`.

Build and use a static source:

```bash
skillrouter index-source ./skillrouter.source.yaml --out ./public/index
skillrouter source add ./public/index public
skillrouter source list
skillrouter recommend "帮我生成一份产品发布 PPT" --source public
```

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
