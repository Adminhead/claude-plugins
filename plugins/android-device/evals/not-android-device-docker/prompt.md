---
name: not-android-device-docker
description: Hard negative. A crashed container log question should not load the android-device skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

My docker container exited a minute after starting. Which command shows me why it crashed?
