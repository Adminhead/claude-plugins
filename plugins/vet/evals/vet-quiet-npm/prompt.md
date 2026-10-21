---
name: vet-quiet-npm
description: "Near miss: an npm package safety check belongs to dependency-vetting, not vet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Check whether the npm package left-padx is safe to add to package.json.
