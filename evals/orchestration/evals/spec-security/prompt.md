---
name: spec-security
description: "specialists set: routes to security-auditor."
tags: [routing, specialists]
plugins: ["../../fixtures/orchestrator-main", "../../../../plugins/orchestration", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/coder-high", "../../../../plugins/coder-critical", "../../../../plugins/coder-max", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate", "../../../../plugins/dba", "../../../../plugins/devops", "../../../../plugins/security-auditor"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
---

Audit .github/workflows/ci.yml and our deploy setup for supply-chain and CI trust risks before we open the repo to outside contributors.
