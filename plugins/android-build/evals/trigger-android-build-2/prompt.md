---
name: trigger-android-build-2
description: A duplicate class failure routes to android-build.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

`./gradlew :app:assembleRelease` dies with

```
Execution failed for task ':app:checkReleaseDuplicateClasses'.
> Duplicate class kotlin.collections.jdk8.CollectionsJDK8Kt found in modules
  kotlin-stdlib-1.9.24 (org.jetbrains.kotlin:kotlin-stdlib:1.9.24) and
  kotlin-stdlib-jdk8-1.6.21 (org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.6.21)
```

It's an Android app with a few modules and an old networking library. How do I get rid of it?
