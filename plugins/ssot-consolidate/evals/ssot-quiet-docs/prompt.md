---
name: ssot-quiet-docs
description: "Near miss: auditing docs for drift from the CLI belongs to docs-audit."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Audit the docs for drift from what the CLI actually does today.
