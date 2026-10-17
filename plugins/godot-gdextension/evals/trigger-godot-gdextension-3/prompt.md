---
name: trigger-godot-gdextension-3
description: "Hard negative: GDScript performance tuning with no native code; godot-gdextension must stay quiet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My GDScript flood-fill over a 256x256 grid in Godot 4.7 takes 40 ms. Here is the loop using an Array of Arrays and a recursive helper. How do I make it faster in GDScript?
