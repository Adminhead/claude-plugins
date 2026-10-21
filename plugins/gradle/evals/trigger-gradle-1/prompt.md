---
name: trigger-gradle-1
description: A configuration cache failure reported by symptom should load the gradle skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Since I turned on the configuration cache, `./gradlew :app:printVersion` fails with "invocation of 'Task.project' at execution time is unsupported". The task is in app/build.gradle.kts. Without the cache flag it runs fine. What's wrong?
