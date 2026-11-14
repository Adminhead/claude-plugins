---
name: not-branching-open-pr
description: Hard negative. Opening a pull request is a ship task and must not load the branching-model skill.
tags: [routing]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm done with the retry backoff fix on branch fix/retry-backoff and it is pushed. open a PR against main for it.
