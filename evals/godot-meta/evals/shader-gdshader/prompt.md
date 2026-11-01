---
name: shader-gdshader
description: "A .gdshader request goes to godot-shaders."
tags: [routing, paired]
plugins: ["../../../../plugins/godot", "../../../../plugins/godot-physics", "../../../../plugins/godot-shaders", "../../../../plugins/godot-export", "../../../../plugins/godot-testing", "../../../../plugins/godot-mcp-setup", "../../../../plugins/game-design", "../../../../plugins/game-architecture", "../../../../plugins/game-feel", "../../../../plugins/level-design", "../../../../plugins/game-ui", "../../../../plugins/game-audio", "../../../../plugins/game-performance", "../../../../plugins/game-playtest", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write me a canvas_item .gdshader for a dissolve effect on my enemy sprite: a noise texture uniform, a dissolve amount from 0 to 1, and a glowing orange edge where it burns away.
