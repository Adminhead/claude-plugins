---
name: commit-trigger
description: A request to commit staged work routes to git:commit.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

I've staged a rename of src/utils/fmt.py to src/utils/formatting.py (git mv, plus updating the 4 imports that referenced the old name). The repo uses Conventional Commits enforced by commitlint. Please commit my staged changes with a good message.
