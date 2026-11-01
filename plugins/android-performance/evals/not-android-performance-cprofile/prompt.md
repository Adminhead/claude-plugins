---
name: not-android-performance-cprofile
description: Hard negative. A Python profiling question should not load the android-performance skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

My Flask endpoint is slow and I ran cProfile on it. How do I read the cumulative time column to find the hot function?
