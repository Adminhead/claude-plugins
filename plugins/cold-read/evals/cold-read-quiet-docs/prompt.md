---
name: cold-read-quiet-docs
description: "Near miss: comparing a README to the code belongs to docs-audit, not cold-read."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Check the README against the code and list anything that no longer matches.
