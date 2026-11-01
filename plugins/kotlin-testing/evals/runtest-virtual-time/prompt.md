---
name: runtest-virtual-time
description: Tests for a retrying coroutine client advance virtual time and never block.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
---

Write Kotlin unit tests for the suspend function in src/main/kotlin/acme/RetryingClient.kt in src/test/kotlin/acme/RetryingClientTest.kt. Cover success on the first call, success after two failures, and giving up after three. The pause between attempts is five seconds and I don't want the suite to take fifteen seconds of wall time. If the class needs a change to be testable, make it. You can't run Gradle here, so just write the code.
