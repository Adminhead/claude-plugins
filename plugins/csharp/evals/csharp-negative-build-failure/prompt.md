---
name: csharp-negative-build-failure
description: An MSBuild custom-target failure does not route to csharp.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

`dotnet build` started failing on CI with `error MSB3073: The command "protoc ..." exited with code 1` from a custom target in our Directory.Build.targets, but only for the net8.0 target of a multi-targeted project. Locally it passes. I have the build.binlog from the CI run. How do I find out what is different?
