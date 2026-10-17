---
name: trigger-godot-1
description: "A GDScript bug in a Godot project loads the godot skill."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot game the coins disappear when the player touches them, but the score label never goes up. The coin is an Area2D scene with coin.gd and the score lives in a ScoreManager autoload. What should I check, and how do I fix it?
