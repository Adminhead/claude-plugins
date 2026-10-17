---
name: game-publish-negative-export
description: "A Godot export preset error does not route to game-publish."
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Running `godot --headless --export-release "Windows Desktop" build/game.exe` fails with "No export template found at the expected path". The preset exists in export_presets.cfg. What's wrong?
