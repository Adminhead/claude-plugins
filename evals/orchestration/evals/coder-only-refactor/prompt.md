---
name: coder-only-refactor
description: "coder-only set: routes to coder."
tags: [routing, coder-only]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/reviewer"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Refactor src/routes/users.ts so route handlers live in a new src/controllers/users.ts, keep behaviour identical, and update the tests.
