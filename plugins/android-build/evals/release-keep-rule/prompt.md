---
name: release-keep-rule
description: Outcome case. A Gson model that breaks only in release gets a narrow fix and minify stays on.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
---

Our release build of the app module parses the Order JSON from the server as all nulls, but the debug build is fine (see crash.txt). app/proguard-rules.pro is empty. Please fix it in the repo files so release works, keeping the release build optimized.
