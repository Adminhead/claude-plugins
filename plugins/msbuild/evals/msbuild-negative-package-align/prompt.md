---
name: msbuild-negative-package-align
description: Aligning NuGet package versions does not route to msbuild.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We have nine projects referencing Serilog, Serilog.Sinks.Console and Microsoft.Extensions.Hosting at three or four different versions each. I want them all on one version per package, set in one place, without changing anything else. How should I do that?
