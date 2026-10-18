---
name: perf-frame-spikes
description: "A frame-time spike investigation plan goes to game-performance."
tags: [routing, paired]
plugins: ["../../../../plugins/godot", "../../../../plugins/godot-physics", "../../../../plugins/godot-shaders", "../../../../plugins/godot-export", "../../../../plugins/godot-testing", "../../../../plugins/godot-mcp-setup", "../../../../plugins/game-design", "../../../../plugins/game-architecture", "../../../../plugins/game-feel", "../../../../plugins/level-design", "../../../../plugins/game-ui", "../../../../plugins/game-audio", "../../../../plugins/game-performance", "../../../../plugins/game-playtest", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My game hitches every few seconds even though average FPS is fine. How do I find out what's causing the spikes and fix them?
