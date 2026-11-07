---
name: fact-check-quiet-trivia
description: "Near miss: a plain factual question with no earlier answer to check should not load fact-check."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

What's the default port for PostgreSQL?
