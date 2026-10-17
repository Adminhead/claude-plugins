---
name: xunit-v3-and-mtp
description: Moving tests from xUnit v2 to xunit.v3 on Microsoft.Testing.Platform routes to dotnet-upgrade-guide.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our test projects use xunit 2.9 with xunit.runner.visualstudio. We'd like to move them to xunit.v3 and eventually run them on Microsoft.Testing.Platform instead of VSTest. What do we need to change, and how do our --filter commands in CI translate?
