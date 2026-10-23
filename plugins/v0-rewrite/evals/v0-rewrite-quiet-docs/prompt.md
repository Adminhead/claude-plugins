---
name: v0-rewrite-quiet-docs
description: "Near miss: fixing README and code drift belongs to docs-audit, not v0-rewrite."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Fix the drift between the README and the code.
