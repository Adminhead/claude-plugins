---
name: no-coder-feature
description: "no-coder set: routes to general-purpose."
tags: [routing, no-coder]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/reviewer", "../../../../plugins/debugger"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Add a DELETE /users/:id endpoint (src/routes/users.ts, src/db/users.ts) that returns 204, or 404 for an unknown id, with tests.
