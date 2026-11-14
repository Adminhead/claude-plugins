---
name: not-git-flow-commit
description: Hard negative. A plain commit request belongs to git-commit and must not load the branching-model skill.
tags: [routing]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I staged my changes to src/retry.py (exponential backoff with jitter). make a commit for them with a proper message.
