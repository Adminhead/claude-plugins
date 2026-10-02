---
name: trigger-create-skill-1
description: A realistic request that should load authoring:create-skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a Claude Code skill for our team that walks through cutting a release: bump the version, update CHANGELOG.md, tag, and open the release PR. Put it under .claude/skills/release/.
