---
name: fool-quiet-format
description: A mechanical formatting request must not load the-fool.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Format this JSON so it's readable: {"a":1,"b":[1,2,3]}
