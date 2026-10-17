---
name: depr-sunset-v1
description: Upstream positive trigger: API sunset planning should load deprecation-migration.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We are sunsetting the v1 API, which has about 200 external consumers and a v2 replacement. Plan the deprecation.
