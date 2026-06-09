# Security and Privacy

Open Skill Router is designed to be conservative because skills can contain
instructions, scripts, references, and assets that influence agent behavior.

## Privacy Modes

### Strict

- No task text is sent to remote recommendation services.
- Matching and reranking happen locally.
- Remote access is limited to public source/index updates.

### Balanced

- Task text, file types, target agent, and low-sensitivity routing metadata may
  be sent to a configured recommendation endpoint.
- User files, local source code, API keys, and full project contents are not sent.

### Cloud

- Allows richer task summaries and preference signals.
- Still does not upload user files by default.

## Install Safety

Before installation, the user must be able to see:

- Source URL.
- Repository, path, ref, and resolved commit SHA.
- File list.
- Content hash.
- Script presence.
- Permission inference.
- Risk level.
- Update policy.

## Risk Levels

### Low

- Pure `SKILL.md`.
- No scripts.
- No network access.
- No file write requirement.

### Medium

- Workspace read.
- Generated output files.
- Allowlisted network domains.
- Python or Node usage in a sandbox.

### High

- Shell execution.
- Arbitrary network access.
- Reads outside the workspace.
- Environment secret access.
- File upload behavior.

### Unknown

- Dynamic or opaque behavior.
- Unsupported file types.
- Obfuscated scripts.
- Incomplete metadata.

## Update Policy

Safe update candidates:

- Documentation-only changes.
- Description or example changes.
- Non-executable references/assets with unchanged permissions.

Requires confirmation:

- New scripts.
- Expanded filesystem access.
- Expanded network access.
- New runtime requirements.

Blocked from automatic update:

- Source repository change.
- Author/publisher mismatch.
- Unexpected hash mismatch.
- Permission downgrade claim that cannot be verified.

## MVP Script Policy

MVP installs and loads skills but does not execute third-party skill scripts.
Script execution can be designed later behind explicit sandbox permissions.
