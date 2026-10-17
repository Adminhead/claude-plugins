---
name: pre-commit-routing
description: Setting up commit hooks routes to pre-commit:pre-commit.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Set up commit-time hooks for this Python repo so ruff and trailing-whitespace checks run before every commit and in CI.
