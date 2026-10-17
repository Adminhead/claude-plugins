---
name: test-gap-audit-routing
description: Asking what tests are missing routes to test-gap-audit.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Audit this repo and tell me which areas lack tests or have weak ones, ranked by risk. Do not write any tests yet.
