---
name: session-recover-quiet-handoff
description: "Near miss: a live session handoff belongs to handoff, not session-recover."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm about to stop for the day and this session is still going fine. Write a handoff so a fresh session can continue the auth refactor tomorrow.
