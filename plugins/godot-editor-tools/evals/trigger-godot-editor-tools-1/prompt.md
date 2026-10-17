---
name: trigger-godot-editor-tools-1
description: An editor dock plugin task that should load godot-editor-tools.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm writing a Godot 4.7 editor addon in addons/level_tools/. Add a dock on the right side that lists every scene under res://levels and opens one on double-click, and make sure disabling the plugin removes it cleanly.
