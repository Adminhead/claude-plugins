---
name: not-android-build-maven
description: Hard negative; a Maven Surefire question must not load android-build.
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Maven multi-module Java service, Surefire runs the integration tests too and the build takes forever. How do I make `mvn test` run only the unit tests and leave the *IT classes for `mvn verify`?
