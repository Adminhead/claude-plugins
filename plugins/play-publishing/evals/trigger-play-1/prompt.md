---
name: trigger-play-1
description: A versionCode rejection on upload should load the play-publishing skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our CI job fails when it uploads the release bundle to Google Play with "Version code 42 has already been used. Try a higher version code." The versionCode is set in app/build.gradle.kts. What do I change so the upload goes through?
