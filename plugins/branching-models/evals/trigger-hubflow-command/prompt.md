---
name: trigger-hubflow-command
description: A question about what a git hf command does in a HubFlow repo routes to git-flow, which now holds HubFlow.
tags: [routing]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

this old repo has a [hubflow] section in .git/config and the team keeps saying "just run git hf release finish 2.6.0". what does that actually do, and is it safe to run from my laptop right now?
