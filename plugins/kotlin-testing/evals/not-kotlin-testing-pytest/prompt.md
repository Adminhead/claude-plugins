---
name: not-kotlin-testing-pytest
description: Hard negative; a pytest fixture scope question must not load kotlin-testing.
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In pytest, my database fixture is created again for every test and the suite takes forever. How do I make it set up once per session without tests leaking state into each other?
