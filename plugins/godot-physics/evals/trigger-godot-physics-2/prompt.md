---
name: trigger-godot-physics-2
description: Jitter on a 3D follow camera with physics interpolation should load godot-physics.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot 4 3D game the player moves smoothly at 60 Hz but on my 144 Hz monitor everything stutters. I turned on physics interpolation in project settings and now the player is smooth but the Camera3D (child of the player, with a script that lerps toward a target in `_physics_process`) still jitters, and when I respawn the player it visibly streaks across the map. How do I fix both?
