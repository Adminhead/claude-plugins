---
name: mistake-proof-quiet-bugs
description: "Near miss: finding bugs already on the page belongs to code review, not mistake-proof."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this function for bugs: def avg(xs):
    return sum(xs) / len(xs) - 1
