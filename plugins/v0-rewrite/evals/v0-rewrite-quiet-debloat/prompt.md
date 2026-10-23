---
name: v0-rewrite-quiet-debloat
description: "Near miss: tightening a wordy paragraph is debloat, which is manual, so v0-rewrite stays quiet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Tighten the intro paragraph in docs/README.md, it's wordy.
