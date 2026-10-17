---
name: depr-quiet-darkmode
description: Upstream negative trigger: a UI feature request must not load deprecation-migration.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a dark mode toggle to the settings page of our React app.
