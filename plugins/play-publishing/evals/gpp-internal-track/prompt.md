---
name: gpp-internal-track
description: Wiring a release to Google Play moves signing passwords out of the build script and defaults to the internal track and a draft release.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
---

I want app/build.gradle.kts to ship the release bundle to Google Play from CI. Set up whatever the build needs for that and fix anything in the file that shouldn't be there. Don't run any upload yourself, there is no network anyway.
