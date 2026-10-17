---
name: trigger-godot-gdextension-1
description: A godot-cpp binding task that should load godot-gdextension.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot 4.7 project has a native/ folder with SConstruct, a godot-cpp submodule and bin/terrain.gdextension. Add a C++ class TerrainChunk (extends MeshInstance3D) with an exported int `resolution` and a `regenerate()` method callable from GDScript, and tell me what to change so it builds against 4.7.
