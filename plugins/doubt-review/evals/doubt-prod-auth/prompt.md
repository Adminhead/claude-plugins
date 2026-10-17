---
name: doubt-prod-auth
description: "Upstream positive trigger: in-flight high-stakes decision should load doubt-review."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

This change touches production auth: we cache the session lookup in a process-local LRU keyed by token and skip the DB on hits. Cross-examine every assumption before we proceed.
