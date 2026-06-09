# Install Safety

SkillRouter is local-first and user-confirmed. Before installing or updating,
review:

- source URL
- locator
- ref and resolved commit SHA when available
- content hash
- file list
- script findings
- inferred filesystem/network/runtime/secret permissions
- risk level
- lockfile path
- target agent host and install path

Default policy:

- Low and medium risk skills may be installed after the user sees the plan.
- High risk skills require explicit confirmation and should not be installed by accident.
- Updates that add scripts or expand permissions require confirmation.
- Pinned skills must not update automatically.
- Source changes or suspicious hash changes must not be silently accepted.

Never execute third-party skill scripts as part of recommendation, inspection,
installation, or update checks.
