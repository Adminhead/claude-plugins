---
name: ripgrep-vs-codegraph
description: A request for every literal text match in all files routes to ripgrep, not codegraph.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

List every file in this repo, hidden ones included, that contains the exact text `TODO(security)`, with the line numbers.
