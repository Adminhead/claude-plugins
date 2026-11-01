---
name: room-migration
description: A Room schema bump from 3 to 4 gets a registered migration that fills existing rows, and never a destructive fallback.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, Bash]
---

I added a non-null `locale` column to User in app/src/main/java/com/example/data/User.kt and bumped the version in AppDatabase.kt from 3 to 4. Existing installs now crash with "A migration from 3 to 4 was required but not found". Fix it in AppDatabase.kt so people keep their data. There is no Android SDK in this environment, so don't try to build.
