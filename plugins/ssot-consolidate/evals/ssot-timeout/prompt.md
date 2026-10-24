---
name: ssot-timeout
description: "A value copied across a config file, a constant and docs, with disagreeing copies, routes to ssot-consolidate."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The request timeout shows up in config/server.yaml, as a constant in src/http/client.ts and in two docs, and the copies disagree. Find every place and get it down to one source of truth.
