---
name: fact-check-quiet-doubt
description: "Near miss: doubting a risky production change belongs to doubt-review, not fact-check."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm about to run a migration that drops the legacy_orders table on production tonight. Before I do, challenge whether this is safe and tell me what could go wrong.
