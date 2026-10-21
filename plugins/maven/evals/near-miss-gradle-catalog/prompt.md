---
name: near-miss-gradle-catalog
description: A Gradle version-catalog question does not route to maven:maven.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Our Gradle build keeps versions in `gradle/libs.versions.toml`. How do I add a new library alias for `org.jetbrains.kotlinx:kotlinx-coroutines-core`, and then reference it from a subproject's `build.gradle.kts` using the type-safe accessor?
