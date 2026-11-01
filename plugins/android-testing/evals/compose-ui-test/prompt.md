---
name: compose-ui-test
description: A sleeping, copy-asserting Compose UI test is rewritten to wait on a condition and assert behavior.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, Bash]
---

app/src/androidTest/java/com/acme/items/ItemListScreenTest.kt passes on my laptop and fails on CI about a third of the time. Fix the test so it stops flaking. The test source is the only thing to change; you can't run it here, there is no Android SDK or device.
