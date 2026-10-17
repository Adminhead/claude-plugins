---
name: triage-routing
description: Reviewing open issues routes to github:triage.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

We have 40 open issues and a few external PRs nobody has looked at. Go through them: categorise each, find duplicates, and tell me which to close, which need more info, and which are ready to work on.
