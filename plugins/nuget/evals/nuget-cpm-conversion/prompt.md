---
name: nuget-cpm-conversion
description: A Central Package Management conversion routes to nuget, not msbuild.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Please convert our solution (src/Contoso.sln, 14 projects, all SDK-style with PackageReference) to Central Package Management with a Directory.Packages.props. A couple of packages have different versions in different projects, and some versions come from properties like $(EfCoreVersion) in Directory.Build.props.
