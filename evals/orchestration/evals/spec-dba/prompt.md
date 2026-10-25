---
name: spec-dba
description: "specialists set: routes to dba."
tags: [routing, specialists]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate", "../../../../plugins/dba", "../../../../plugins/devops", "../../../../plugins/security-auditor"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Design a zero-downtime migration that moves users.email into a separate user_emails table so a user can have several emails, including the backfill and the rollback.
