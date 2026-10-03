---
name: codegraph-vs-ripgrep
description: A request to trace a call path and callers routes to codegraph, not ripgrep.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Trace what happens when `saveOrder` runs, from the handler down to the database write, and tell me everything that calls it. I want to understand the whole flow before I change it.
