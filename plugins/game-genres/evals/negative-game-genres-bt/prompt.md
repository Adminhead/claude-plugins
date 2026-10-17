---
name: negative-game-genres-bt
description: A behavior-tree runtime bug is a near miss and should not load game-genres.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My enemy behavior tree restarts its MoveTo action every tick, so the enemy stutters and never arrives. The root is a selector over a chase sequence and a patrol action. What's wrong with how my composites handle RUNNING?
