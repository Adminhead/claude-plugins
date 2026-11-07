---
name: tunnel-check-quiet-fix
description: "Near miss: an ordinary debugging request with no direction check should not load tunnel-check."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Why does this raise a KeyError? config = {'host': 'x'}; print(config['port'])
