---
name: java-upgrade-21
description: Outcome. A Java 11 project upgraded to 21 with no JDK available to build.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write, Bash]
---

Our service in this directory is stuck on Java 11 and we want it on 21. This laptop has no JDK installed, so you can't build anything here. Update `pom.xml` to the final state for 21, and then tell me, in your reply, how to do the move in steps and what to run or check after each step so I can do it on the CI box.
