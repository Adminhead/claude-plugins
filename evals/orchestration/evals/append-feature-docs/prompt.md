---
name: append-feature-docs
description: "append route, real subagents: a feature that makes the README stale goes to one coder, which updates code, tests and README; no scribe call."
tags: [outcome, full, append]
plugins: ["../../fixtures/orchestrator-append", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 14
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Edit, Write, Bash]
---

Add pagination to GET /users: `page` (default 1) and `limit` (default 20, max 100) query parameters, and respond with `{ data, page, limit, total }` instead of a bare array. Update the existing tests for the new shape and add one for paging.
