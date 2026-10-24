---
name: testing-gut
description: "Writing GUT tests goes to godot-testing, not generic unit-testing."
tags: [routing, paired]
plugins: ["../../../../plugins/godot", "../../../../plugins/godot-physics", "../../../../plugins/godot-shaders", "../../../../plugins/godot-export", "../../../../plugins/godot-testing", "../../../../plugins/godot-mcp-setup", "../../../../plugins/game-design", "../../../../plugins/game-architecture", "../../../../plugins/game-feel", "../../../../plugins/level-design", "../../../../plugins/game-ui", "../../../../plugins/game-audio", "../../../../plugins/game-performance", "../../../../plugins/game-playtest", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot project uses GUT. Write tests for my inventory.gd script's add_item and remove_item, including the stack-limit edge case, and tell me how to run them headless in CI.
