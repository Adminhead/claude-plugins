---
name: commit-near-miss
description: A read-only history question does not route to git:commit.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Show me the last five commits on this branch with their authors and dates, one line per commit. Tell me which git command gives that.
