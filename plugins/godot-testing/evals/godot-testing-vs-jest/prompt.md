---
name: godot-testing-vs-jest
description: "A Jest test question for a web game does not load godot-testing."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My browser game is plain TypeScript with Phaser. How do I unit test the `ScoreBoard` class with Jest when its constructor needs a `Phaser.Scene`? I just want to check that `addPoints(5)` updates `total`.
