# Cache

Cache owns local storage, lockfiles, update checks, and installed skill metadata.

Implemented behavior:

- Inspect local and GitHub skill sources.
- Install to a local cache.
- Copy into the generic Agent Skills target.
- Write YAML lockfiles.
- Record commit SHA, content hash, permissions, risk, file count, and script count.
- Check updates and classify permission changes.
- Apply safe updates.
- Pin installed skills.
