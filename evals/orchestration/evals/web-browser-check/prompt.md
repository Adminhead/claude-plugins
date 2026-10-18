---
name: web-browser-check
description: "web set: routes to browser-tester."
tags: [routing, web]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/coder-high", "../../../../plugins/coder-critical", "../../../../plugins/coder-max", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate", "../../../../plugins/browser-tester", "../../../../plugins/web-perf-auditor", "../../../../plugins/playwright-cli"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

The signup flow is deployed at http://localhost:3000/signup. Check it in a real browser against these acceptance criteria: an invalid email shows an inline error, a valid signup lands on /welcome, and the back button doesn't resubmit. Report pass, fail or blocked for each.
