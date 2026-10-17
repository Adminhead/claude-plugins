---
name: trigger-grep-app-1
description: A realistic request that should load code-search:grep-app.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

What do other projects put in their GitHub Actions workflows when they cache pnpm dependencies? I'd like to see real `actions/setup-node` configs rather than guess.
