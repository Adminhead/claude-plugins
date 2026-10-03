---
name: context7-vs-grep-app
description: A request for current library docs routes to context7, not grep-app.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm on Pydantic 2.x and need to validate one field before type coercion runs. What's the right decorator and its arguments for that in the current version? Please check the real documentation instead of going from memory.
