---
name: trigger-godot-multiplayer-2
description: A Godot dedicated server request that should load godot-multiplayer.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Godot 4.7 arena shooter needs a dedicated server we can run in Docker on a Linux VPS. How do we make the server build start without a window, branch server versus client code at boot, read the port from the command line, and keep textures out of the server package?
