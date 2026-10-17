---
name: trigger-godot-testing-2
description: "A Godot headless test run that hangs in CI loads godot-testing."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our GitHub Actions job runs `godot --headless --path . --script res://tests/run_all.gd` and it just sits there until the job times out after six hours. Locally the tests print their results. On a fresh clone I also get `Identifier "SaveData" not declared in the current scope`. What's going on and how should the job look?
