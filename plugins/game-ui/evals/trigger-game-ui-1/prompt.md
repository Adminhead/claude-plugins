---
name: trigger-game-ui-1
description: "A realistic request that should load the game-ui skill."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our twin-stick shooter the pause menu works with the mouse but on a controller nothing is selected when it opens, and pressing back from the settings screen unpauses the game entirely. How should I structure the menus so this stops happening?
