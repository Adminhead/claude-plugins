---
name: trigger-problem-solving-2
description: A realistic request that should load coding-core:problem-solving.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our /reports endpoint went from about 300ms to about 4s after last Tuesday's deploy. The deploy touched the ORM version, added a `last_viewed_by` column to `reports`, and bumped the web workers from 2 to 4. Nothing in the app logs looks wrong. Where do I start finding out what happened?
