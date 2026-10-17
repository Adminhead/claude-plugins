---
name: trigger-godot-gdextension-2
description: A GDExtension load failure that should load godot-gdextension.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My exported Linux build of a Godot game prints `No GDExtension library found for current OS and architecture (linux.x86_64)` for res://addons/voxel/voxel.gdextension and the voxel nodes are missing, but it works in the editor. What's wrong?
