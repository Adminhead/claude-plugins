---
name: not-upgrade-run-filtered-tests
description: Running a filtered subset of .NET tests is dotnet-testing work, not an upgrade.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In this .NET 10 solution, how do I run just the tests in the OrderServiceTests class with dotnet test, and get a TRX file out of it? We're on MSTest.
