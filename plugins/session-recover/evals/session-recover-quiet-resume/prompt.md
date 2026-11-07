---
name: session-recover-quiet-resume
description: "Near miss: restoring the old conversation whole is claude --resume, not session-recover."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

How do I get my earlier conversation back exactly as it was, full message history and all, in a new terminal?
