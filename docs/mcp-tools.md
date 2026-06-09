# MCP Tools

Open Skill Router exposes MCP tools so local agents can discover and install
skills through a consistent safety layer.

## `recommend_skills`

Input:

```json
{
  "task": "分析这个专利交底书，评估授权概率，输出 PDF 报告",
  "agent_host": "claude-code",
  "file_types": ["docx"],
  "privacy_mode": "balanced",
  "max_results": 5
}
```

Output includes:

- Skill ID.
- Name.
- Score.
- Confidence.
- Source URL.
- Locator.
- Installed state.
- Risk level.
- Recommended action.
- Explanation.

## `inspect_skill`

Returns source, version, file list, inferred permissions, risk level, and install
status.

## `install_skill`

Builds and applies an install plan. The implementation must resolve refs to a
commit SHA, compute content hash, scan permissions, and write lockfiles.

## `load_skill`

Returns the local cache path or a safe summary that the calling agent can load.

## `update_skill`

Checks for updates and classifies them as safe, confirmation-required, or blocked.

## `record_feedback`

Records whether a recommendation was accepted and whether it helped, without
storing sensitive task content by default.
