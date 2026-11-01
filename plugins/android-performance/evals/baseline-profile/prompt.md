---
name: baseline-profile
description: Outcome case. Adding a baseline profile for startup yields a producer module with a generator, a consumer wiring and an honest measuring plan.
tags: [outcome]
runs: 1
model: claude-sonnet-5-5
max_turns: 16
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
---

Cold start of this app is slow on real phones. Add a baseline profile for the startup path. Put the new module in baselineprofile/ (build file baselineprofile/build.gradle.kts, generator in baselineprofile/src/main/java/com/example/notes/baselineprofile/BaselineProfileGenerator.kt), wire it into the app and settings, and tell me how to generate it and how to prove it helped. There is no device or Android SDK on this machine.
