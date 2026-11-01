---
name: trigger-android-1
description: A Room missing-migration crash reported by symptom should load the android skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

After I added a column to the User table and bumped the database version from 3 to 4, the app crashes on launch for existing users with "A migration from 3 to 4 was required but not found". Fresh installs work. How do I fix it without wiping their data?
