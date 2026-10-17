---
name: trigger-godot-multiplayer-3
description: "Hard negative: local split-screen in Godot has no networking; godot-multiplayer must stay quiet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot 4 racing game needs local split-screen for two players on one PC: two SubViewports side by side, each with its own Camera3D following its car, and player 2 on a gamepad. How do I set up the scene tree and route input per player?
