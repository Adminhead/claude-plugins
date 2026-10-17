---
name: game-playtest-vs-godot-testing
description: "Writing automated tests for a Godot inventory does not load game-playtest (godot-testing owns it)."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write GUT unit tests for my Godot inventory script: adding a stackable item, overflow into a new slot, and removing more than the stack holds.
