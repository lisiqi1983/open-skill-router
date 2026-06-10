# Core

Core owns task profiling, retrieval orchestration, scoring, and explanations.

It should not know how GitHub is fetched, where files are installed, or how MCP
requests are transported. Those concerns belong to adapters and apps.

Model-assisted recommendation is represented as a bounded candidate pack plus a
validated rerank JSON response. Core merges that response with deterministic
scores and safety actions, but it does not call a model provider.

Static index support lives here too: source manifest parsing, JSONL snapshot
reading/writing, checksum verification, and source registry files. Fetching and
building snapshots from live sources belongs to the indexer app.
