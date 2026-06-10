# Recommendation Scoring

M9 makes multidimensional recommendation weights configurable. The default
weights remain built into the core runtime, but callers can pass a scoring JSON
file or object when they want to tune ranking for a specific workflow.

## Scoring Config

Schema:

```json
{
  "schemaVersion": "skillrouter.scoring/v1",
  "weights": {
    "metadataMatch": 0.2,
    "capabilityCoverage": 0.15,
    "catalogIntentFit": 0.2,
    "domainFit": 0.15,
    "inputOutputFit": 0.2,
    "environmentFit": 0.08,
    "workflowFit": 0.07,
    "qualityFit": 0.03,
    "safetyFit": 0.02
  },
  "modelRerankWeights": {
    "deterministicScore": 0.75,
    "userModelRerank": 0.25
  }
}
```

Weights must be finite non-negative numbers. They are normalized by the runtime,
so callers may use either fractions or relative weights. At least one weight in
each group must be positive.

## CLI Usage

```bash
skillrouter recommend "请审查 GitHub PR 中的 TypeScript 代码变更" --scoring scoring.json
skillrouter recommend "帮我生成 PPT" --api http://127.0.0.1:8765 --scoring scoring.json
```

The same config can be passed to the HTTP API or MCP `recommend_skills` tool as
a `scoring` object.

## Tuning Guidance

Use higher `inputOutputFit` for file-format-sensitive workflows such as PDF,
PPTX, DOCX, or image generation.

Use higher `environmentFit` when the task strongly depends on GitHub, browser,
GPU, local filesystem, or API access.

Use higher `domainFit` and `catalogIntentFit` when the user task is clearly in a
known domain such as patents, code review, data analytics, or presentations.

Use higher `safetyFit` for conservative local-first deployments.

M9 is not yet automatic feedback learning. It is the stable configuration layer
that feedback-tuned weights can target in a later milestone.
