# Local Entry Skill

Open Skill Router should be available to agents as a universal skill-shaped
entry point, but the entry skill should stay thin.

## Principle

The skill is the entrance. The CLI and MCP runtime are the engine.

The entry skill helps an agent know when and how to ask SkillRouter for help.
It does not implement indexing, ranking, caching, installation, or risk scanning
inside prompt instructions.

## Shape

```text
skills/open-skill-router/
  SKILL.md
  references/
    recommendation-policy.md
    install-safety.md
    command-reference.md
```

## Responsibilities

The entry skill should tell an agent to use SkillRouter when:

- The user asks to find, choose, install, update, or inspect an Agent Skill.
- The task likely needs specialized domain capability that is not already loaded.
- Multiple skills could apply and the agent needs a safer recommendation process.
- The user asks for a skill source, GitHub skill, or local skill cache operation.

## Runtime Preference

Preferred path:

```text
entry skill -> MCP tool -> core runtime
```

Fallback path:

```text
entry skill -> CLI command -> core runtime
```

The entry skill may mention commands such as:

```bash
skillrouter recommend "task"
skillrouter inspect github:owner/repo/path@ref
skillrouter install github:owner/repo/path@ref --agent generic --scope user
```

## Init Flow

`skillrouter init` now:

- Create `~/.skillrouter/`.
- Install the `open-skill-router` entry skill into the chosen generic agent host target.
- Write the global or project lockfile.
- Use the same cache, hash, and risk scan path as normal skill installs.

MCP registration and default source manifest indexing are still future work.

## Why Not Only CLI

A CLI is good for humans and scripts, but agents need a discoverable local cue.
The entry skill gives that cue in the native shape many agent systems already
understand.

## Why Not Only MCP

MCP is the cleanest execution interface, but users still need a portable way to
teach an agent when to call it. The skill-shaped entry point fills that gap.

## Why Not Put Logic in the Skill

Prompt-only logic is hard to test and hard to secure. The entry skill should
describe the routing policy and tool usage, while deterministic code handles
source fetching, hashing, cache writes, update diffs, and install plans.
