---
name: full-plan
description: "full set: routes to architect."
tags: [routing, full]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/coder-high", "../../../../plugins/coder-critical", "../../../../plugins/coder-max", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Plan how to split this API into a users service and a billing service with a shared auth layer. Don't implement anything yet; I want the plan and its risks first.
