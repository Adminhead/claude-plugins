---
name: leakage-audit-quiet-evals
description: "Near miss: writing trigger evals belongs to skill-evals, not leakage-audit."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write trigger evals for the vet plugin.
