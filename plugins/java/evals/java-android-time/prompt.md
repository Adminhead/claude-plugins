---
name: java-android-time
description: Outcome. Java in an Android module with minSdk 24 and no desugaring uses java.time safely.
tags: [outcome]
runs: 1
max_turns: 10
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
---

In `app/src/main/java/com/example/app/OrderAge.java`, rewrite `daysOld` to use `java.time` instead of the millisecond arithmetic. Edit the file and say what else, if anything, has to change for it to work.
