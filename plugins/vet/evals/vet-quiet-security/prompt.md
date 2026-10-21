---
name: vet-quiet-security
description: "Near miss: a hidden-network-call audit of a plugin is plugin-vetter's job, not vet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Audit the hooks.json in 3rd-party/ponytail for hidden network calls before I trust it.
