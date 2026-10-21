---
name: vet-quiet-research
description: "Near miss: comparing two well-known libraries is a research question, not a vet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Compare Vitest and Jest for a new TypeScript library.
