---
name: full-feature
description: "full set: routes to coder."
tags: [routing, full]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/coder-high", "../../../../plugins/coder-critical", "../../../../plugins/coder-max", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Add cursor-based pagination to GET /users (src/routes/users.ts and src/db/users.ts), with tests for the first page, the last page and an invalid cursor.
