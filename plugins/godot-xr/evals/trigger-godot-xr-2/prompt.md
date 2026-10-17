---
name: trigger-godot-xr-2
description: An XR controller input bug that should load godot-xr.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot OpenXR project the left thumbstick locomotion doesn't move at all. My XROrigin3D script does `left.get_float("primary_x")` and `left.get_float("primary_y")` on the left XRController3D. The trigger works. What's wrong?
