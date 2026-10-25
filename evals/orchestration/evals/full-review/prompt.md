---
name: full-review
description: "full set: routes to reviewer."
tags: [routing, full]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Review the latest commit on this branch against this spec: payment webhooks must be idempotent per event id, CI must not run untrusted PR code with secrets, and infra changes must be planned before apply. Report findings by severity.
