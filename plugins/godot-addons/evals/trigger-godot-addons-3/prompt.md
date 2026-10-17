---
name: trigger-godot-addons-3
description: "Hard negative: a hand-rolled Godot camera shake with no addon; godot-addons must stay quiet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot 4.7 2D platformer the Camera2D shake I wrote sets `rotation` and `offset` from a trauma value, but only the offset moves. There are no addons in the project. Why doesn't the rotation apply and how should I write the shake?
