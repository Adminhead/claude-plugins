---
name: lens-review-quiet-format
description: "Near miss: a simple one-pass code explanation should not load lens-review."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Explain in two sentences what this does: sorted(d.items(), key=lambda kv: kv[1], reverse=True)[:3]
