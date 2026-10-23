---
name: cold-read-readme
description: 'A "would someone new follow this README" check routes to cold-read.'
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Before I publish this README, would someone new to the project be able to follow it? Read docs/README.md as a stranger would.
