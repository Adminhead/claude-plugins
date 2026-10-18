---
name: full-known-race
description: "full set: routes to coder-critical."
tags: [routing, full]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/coder-high", "../../../../plugins/coder-critical", "../../../../plugins/coder-max", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

We traced the double charge: two deliveries of the same payment webhook race in src/payments/webhook.ts, both see status != 'paid' and both charge. Fix it with a database-level idempotency guard keyed on the event id, safe under concurrent deliveries, and add a test that runs two deliveries at once.
