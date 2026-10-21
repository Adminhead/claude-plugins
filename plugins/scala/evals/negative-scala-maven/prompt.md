---
name: negative-scala-maven
description: A Maven pom question must not load the scala skill.
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my multi-module pom.xml the child modules each repeat the version of jackson-databind. How do I define it once in the parent so the children inherit it?
