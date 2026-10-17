---
name: trigger-godot-shaders-2
description: GPUParticles3D color not showing should load godot-shaders.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I set up a GPUParticles3D spark burst with a ParticleProcessMaterial and a color_ramp from yellow to transparent red, Draw Pass 1 is a QuadMesh with a StandardMaterial3D. The sparks all render plain white and never fade. Also after the first explosion, setting `emitting = true` again sometimes does nothing. What am I missing?
