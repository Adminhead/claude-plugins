---
name: legacy-csproj-sdk-style
description: Converting a legacy .NET Framework csproj with packages.config routes to dotnet-upgrade-guide.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

This class library still has the old 90-line csproj with ToolsVersion, a Compile Include for every file and a packages.config. It targets .NET Framework 4.7.2. How do I turn it into a modern SDK-style project without breaking the build?
