---
name: trigger-game-genres-2
description: A tower-defense wave balance request should load the game-genres skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My tower defense game gets trivial by wave 15: the player has so much gold they can wall the path with maxed towers. How should I scale enemy HP, income and enemy types across waves?
