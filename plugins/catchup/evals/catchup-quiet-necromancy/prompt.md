---
name: catchup-quiet-necromancy
description: "Near miss: recovering a crashed session belongs to necromancy, not catchup."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Recover the session that crashed so I can pick up where it stopped.
