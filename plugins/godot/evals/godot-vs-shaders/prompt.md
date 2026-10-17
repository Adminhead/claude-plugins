---
name: godot-vs-shaders
description: "A dissolve shader for three.js (no Godot) must not load the godot skill."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write me a GLSL fragment shader for a three.js ShaderMaterial in my WebGL page: a dissolve effect on a sprite with a noise texture uniform, a dissolve amount from 0 to 1, and a glowing orange edge where it burns away.
