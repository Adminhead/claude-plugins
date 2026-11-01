---
name: trigger-kotlin-testing-1
description: A runTest that never completes routes to kotlin-testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

One test in our sync module fails on CI after sitting there for a minute:

```
kotlinx.coroutines.test.UncompletedCoroutinesError: After waiting for 1m, the test coroutine is not completing, there were active child jobs: ["coroutine#2":StandaloneCoroutine{Active}@3a1f0c2]
	at app//kotlinx.coroutines.test.TestBuildersKt$runTest$1.invokeSuspend(TestBuilders.kt:341)
```

The test is `SyncerTest.pushes pending items` under sync/src/test/kotlin/com/acme/sync/. It starts a `launch { repository.observePending().collect { ... } }` and then asserts on a list. What is wrong with it?
