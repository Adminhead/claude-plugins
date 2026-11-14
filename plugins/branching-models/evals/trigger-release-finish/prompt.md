---
name: trigger-release-finish
description: A git-flow release finish request routes to git-flow.
tags: [routing]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

we use git-flow with git-flow-next on this project. release/2.4.0 is bumped and QA signed it off, so finish the release for me: tag it and get it into main and develop.
