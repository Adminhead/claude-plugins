---
name: vet-quiet-install
description: "Near miss: installing a named plugin is an install action, not a vetting request."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Install the plugin-vetter plugin at project scope.
