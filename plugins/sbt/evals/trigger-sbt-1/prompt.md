---
name: trigger-sbt-1
description: Symptom-only report of an sbt 2 command-line failure; should load the sbt skill.
tags: [trigger]
runs: 3
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

since we moved the repo to sbt 2 our CI job dies right away. the log only shows `[error] Expected whitespace character` followed by `[error] clean compile test` and exit code 1. the step is just `sbt clean compile test`. what should that command look like on this build?
