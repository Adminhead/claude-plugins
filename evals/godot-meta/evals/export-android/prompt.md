---
name: export-android
description: "An Android export failure goes to godot-export."
tags: [routing, paired]
plugins: ["../../../../plugins/godot", "../../../../plugins/godot-physics", "../../../../plugins/godot-shaders", "../../../../plugins/godot-export", "../../../../plugins/godot-testing", "../../../../plugins/godot-mcp-setup", "../../../../plugins/game-design", "../../../../plugins/game-architecture", "../../../../plugins/game-feel", "../../../../plugins/level-design", "../../../../plugins/game-ui", "../../../../plugins/game-audio", "../../../../plugins/game-performance", "../../../../plugins/game-playtest", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot game exports fine for Linux, but the Android export fails with a keystore error and then the APK installs but crashes on launch. What do I check?
