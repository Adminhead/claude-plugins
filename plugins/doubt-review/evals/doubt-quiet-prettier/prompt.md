---
name: doubt-quiet-prettier
description: Upstream negative trigger: a formatting command must not load doubt-review.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Format src/index.ts with prettier.
