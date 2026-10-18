---
name: godot-control-anchors
description: "Control anchors not resizing is engine work for godot, not game-ui."
tags: [routing, paired]
plugins: ["../../../../plugins/godot", "../../../../plugins/godot-physics", "../../../../plugins/godot-shaders", "../../../../plugins/godot-export", "../../../../plugins/godot-testing", "../../../../plugins/godot-mcp-setup", "../../../../plugins/game-design", "../../../../plugins/game-architecture", "../../../../plugins/game-feel", "../../../../plugins/level-design", "../../../../plugins/game-ui", "../../../../plugins/game-audio", "../../../../plugins/game-performance", "../../../../plugins/game-playtest", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Godot project the pause menu's Control nodes stay stuck in the top-left corner when I resize the window instead of staying centred. How do I set up the anchors and containers?
