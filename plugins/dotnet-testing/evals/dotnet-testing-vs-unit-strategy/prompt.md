---
name: dotnet-testing-vs-unit-strategy
description: Language-agnostic test strategy for a Python module should not load dotnet-testing.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Python pricing module has 40 tests that all mock the database and still miss real bugs. How should I restructure the test suite: which behaviors deserve unit tests, which need integration tests, and what should we stop mocking?
