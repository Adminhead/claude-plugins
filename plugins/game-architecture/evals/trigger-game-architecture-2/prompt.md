---
name: trigger-game-architecture-2
description: A player state-machine sprawl question routes to game-architecture, not game-feel.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My player controller is a 400-line match statement over states like idle, run, jump, fall, attack, block and stunned, and attacking while jumping keeps breaking. How should I restructure the state logic?
