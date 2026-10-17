---
name: hook-repair-routing
description: A failing commit-time hook to be fixed routes to pre-commit:pre-commit (hook repair is merged into it).
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

My commit was rejected: the `ruff` hook in prek failed with "F401 `os` imported but unused" in src/app/util.py, and the end-of-file-fixer hook modified two files. Get the hooks passing so I can commit. Don't commit it yourself.
