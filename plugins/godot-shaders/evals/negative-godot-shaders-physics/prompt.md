---
name: negative-godot-shaders-physics
description: A Godot raycast question does not route to godot-shaders.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot 4 top-down shooter I need to check whether an enemy has line of sight to the player before it fires. Walls are StaticBody2D on layer 2, the player is on layer 1. Should I use a RayCast2D node on each enemy or query the physics space from code, and how do I keep the ray from hitting the enemy itself?
