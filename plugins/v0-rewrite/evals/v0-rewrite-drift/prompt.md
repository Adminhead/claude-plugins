---
name: v0-rewrite-drift
description: "A request to refresh a stale doc as if written fresh routes to v0-rewrite."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The setup guide still describes the old flow and the notes around it are stale. Bring docs/setup.md up to date as if it were written fresh today.
