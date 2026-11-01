---
name: trigger-android-performance-2
description: A startup regression between two CI runs should load the android-performance skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our nightly CI runs a benchmark module against the release-like build on a Pixel 6. Yesterday's JSON has a timeToInitialDisplayMs median of 612 and today's is 655. Is that a regression we should block the merge on?
