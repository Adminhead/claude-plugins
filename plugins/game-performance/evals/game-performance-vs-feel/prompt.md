---
name: game-performance-vs-feel
description: Camera jitter at a steady frame rate does not route to game-performance.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

At a rock-steady 144 FPS my follow camera still looks jittery when the player runs, but the background scrolls smoothly when I move the camera by hand. What's causing it?
