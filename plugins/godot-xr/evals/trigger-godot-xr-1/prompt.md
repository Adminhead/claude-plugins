---
name: trigger-godot-xr-1
description: A Quest VR setup question that should load godot-xr.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm starting a VR game in Godot 4.7 for Meta Quest 3. project.godot already has xr/openxr/enabled=true. Give me the main scene node tree, the _ready code to start XR, and the export preset settings I need to deploy to the headset over USB.
