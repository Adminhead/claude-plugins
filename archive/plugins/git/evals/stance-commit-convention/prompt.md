---
name: stance-commit-convention
description: "Commit message in a repo with release-please and sloppy history; stance: Conventional Commits, not copied history; git:commit."
tags: [quality, stance]
runs: 1
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
model: claude-sonnet-5-5
---

I need a message for the change sitting in `staged.diff`. Put just the message text in `COMMIT_MSG.txt`. The recent history is in `history.txt`. Do not run git.
