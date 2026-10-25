---
name: spec-devops
description: "specialists set: routes to devops."
tags: [routing, specialists]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate", "../../../../plugins/dba", "../../../../plugins/devops", "../../../../plugins/security-auditor"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Add an RDS Postgres instance for this API to infra/main.tf with automated backups, deletion protection and a private subnet, and show me the plan. Don't apply anything.
