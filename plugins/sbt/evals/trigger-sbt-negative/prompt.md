---
name: trigger-sbt-negative
description: Gradle wrapper question on JDK 21; a near-miss build tool that should not load the sbt skill.
tags: [trigger]
runs: 3
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

our Gradle build fails on JDK 21 with `Unsupported class file major version 65`. the wrapper is pinned to an old 7.x release in gradle/wrapper/gradle-wrapper.properties. which wrapper version should we move to, and how do I change it?
