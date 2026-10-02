---
name: trigger-commit-2
description: A realistic request that should load git:commit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I have unstaged edits in three places: a typo fix in README.md, a new `--dry-run` flag in cli/main.go, and a version bump in package.json. Commit these for me as separate, sensible commits.
