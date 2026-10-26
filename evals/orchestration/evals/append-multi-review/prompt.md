---
name: append-multi-review
description: "append route, real subagents: a multi-file feature goes to a coder and gets exactly one reviewer pass."
tags: [outcome, full, append]
plugins: ["../../fixtures/orchestrator-append", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 14
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Edit, Write, Bash]
---

Add `POST /users` that creates a user from a JSON body `{ "email": "..." }`. It returns 201 with the new user, 400 `{ "error": "invalid email" }` for a missing or malformed email, 409 `{ "error": "duplicate" }` when the email already exists (case-insensitive), and 400 for a body that isn't valid JSON. The new user gets the next id and the current time as `createdAt`. Put the storage in the db module, the handler in the routes module and the body parsing in the server, and add tests for each response.
