---
name: trigger-sbt-2
description: Release script on a 2.x build fails with a scoped-key error; should load the sbt skill.
tags: [trigger]
runs: 3
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

our release script runs `sbt "Compile/update"` before packaging and it started dying with `No such setting/task`. it worked last year on the old build. project/build.properties says 2.0.11. what changed, and what should the script run instead?
