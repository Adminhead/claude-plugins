---
name: profile-changes-output
description: A ## Sentry section in the project's CLAUDE.md sets the init choices that the generic defaults would not.
tags: [quality, stance]
runs: 1
max_turns: 14
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
model: claude-sonnet-5-5
---

Wire Sentry into this Flask service. Put the initialization in a new `sentry_setup.py` that `app.py` imports at the top. Do not install packages or send any events.
