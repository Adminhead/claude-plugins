---
name: trigger-game-ai-2
description: A utility-scoring request for NPC needs should load the game-ai skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my colony sim, villagers should decide between eating, sleeping, working and socializing based on hunger, fatigue, time of day and who's nearby. Right now it's a big if/else chain and they flip between tasks every frame. What's a better way to score and pick their actions?
