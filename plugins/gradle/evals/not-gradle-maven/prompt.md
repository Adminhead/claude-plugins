---
name: not-gradle-maven
description: Hard negative. A Maven dependency question should not load the gradle skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Maven build ends up with two versions of commons-lang3 on the classpath. Which mvn command shows me which module pulls in each one?
