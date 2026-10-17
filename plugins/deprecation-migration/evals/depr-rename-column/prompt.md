---
name: depr-rename-column
description: "Upstream positive trigger: zero-downtime column rename should load deprecation-migration."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

How do I rename the users.name column to full_name in production Postgres without downtime?
