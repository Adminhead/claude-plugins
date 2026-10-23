---
name: ssot-quiet-imports
description: "Near miss: deduping imports is a code cleanup, not consolidation of a fact."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Dedupe the imports at the top of src/server.ts.
