---
name: gh-issues-routing
description: Filing one issue routes to gh-issues:gh-issues.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

File a GitHub issue in this repo titled "Login button misaligned on Safari", labelled bug, and assign it to the v2.1 milestone.
