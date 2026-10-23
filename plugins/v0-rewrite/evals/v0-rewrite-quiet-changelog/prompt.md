---
name: v0-rewrite-quiet-changelog
description: "Near miss: adding a changelog entry is append-only history, not a rewrite."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a changelog entry for the new --dry-run flag.
