---
name: v0-rewrite-design
description: "A request to clean up a design doc after many edits routes to v0-rewrite."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Clean up docs/design.md after the last five edits so it reads as one coherent doc, not a stack of patches.
