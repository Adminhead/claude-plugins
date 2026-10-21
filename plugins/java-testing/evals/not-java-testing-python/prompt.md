---
name: not-java-testing-python
description: Hard negative; a Python test-strategy question must not load java-testing.
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We have a Python service with a thin FastAPI layer over a pricing module. How should I split my tests between unit tests of the pricing rules and tests of the HTTP layer, and roughly how many of each make sense?
