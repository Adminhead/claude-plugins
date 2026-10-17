---
name: history-routing
description: Cleaning up history routes to git:history.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

My branch has 9 commits, including three "fix typo" ones. Fold those fixup commits into the commits they correct, then rebase onto main.
