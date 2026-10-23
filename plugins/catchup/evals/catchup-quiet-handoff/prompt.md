---
name: catchup-quiet-handoff
description: "Near miss: a brief for a fresh agent session belongs to handoff, not catchup."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a handoff so a fresh session can continue this work.
