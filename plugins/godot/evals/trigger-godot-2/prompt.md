---
name: trigger-godot-2
description: "Renaming a node across .tscn files in a Godot project loads the godot skill."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot project I want to rename the `Hurtbox` node in res://player/player.tscn to `HitReceiver`. A couple of other scenes instance player.tscn and there's a signal connection on it. Can I just do this with a text replace in the .tscn files? Walk me through doing it safely.
