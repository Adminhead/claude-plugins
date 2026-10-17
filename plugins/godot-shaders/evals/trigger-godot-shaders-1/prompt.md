---
name: trigger-godot-shaders-1
description: A Godot 2D dissolve effect request should load godot-shaders.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

When an enemy dies in my Godot game I want its Sprite2D to burn away with a glowing orange edge over about a second, then the node should be freed. I've never written a .gdshader before. Can you give me the shader and the GDScript to trigger it?
