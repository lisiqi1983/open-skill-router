# Core

Core owns task profiling, retrieval orchestration, scoring, and explanations.

It should not know how GitHub is fetched, where files are installed, or how MCP
requests are transported. Those concerns belong to adapters and apps.
