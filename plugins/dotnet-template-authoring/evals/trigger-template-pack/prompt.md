---
name: trigger-template-pack
description: "Packaging templates as a NuGet template pack should load dotnet-template-authoring."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We have three project templates under templates/ (api, worker, library). Package them as one NuGet template pack so people can `dotnet new install Contoso.Templates`. Show me the pack project.
