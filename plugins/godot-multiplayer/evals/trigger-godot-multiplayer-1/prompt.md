---
name: trigger-godot-multiplayer-1
description: A Godot netcode request that should load godot-multiplayer.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I am adding online co-op to my Godot 4 platformer. Players host or join by IP. Right now each client moves its own player and calls `@rpc("any_peer") func set_pos(p: Vector2): position = p` every frame, and a friend already showed he can teleport anywhere. How should I restructure this so the host is authoritative, using MultiplayerSpawner and MultiplayerSynchronizer?
