---
name: negative-interop-trim-json
description: "IL2026 trim warnings from System.Text.Json reflection are not native interop work."
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Publishing our net10.0 API with PublishAot=true gives IL2026 and IL3050 warnings from JsonSerializer.Serialize calls in our controllers. How do I fix them properly?
