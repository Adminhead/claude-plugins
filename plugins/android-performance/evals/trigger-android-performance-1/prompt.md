---
name: trigger-android-performance-1
description: A request to add a startup benchmark and baseline profile by symptom should load the android-performance skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Cold start of our app takes about 2.4 seconds on a mid-range phone and Play vitals flags it. We have one app module and no benchmark module yet. Set up what I need to measure startup and speed it up with a profile of the startup path.
