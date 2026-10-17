---
name: roslyn-analyzers-vs-csharp
description: "Tuning CA warnings in application code does not load roslyn-analyzers (csharp owns it)."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

After turning on `<AnalysisLevel>latest-recommended</AnalysisLevel>` our web API project shows about 40 new CA warnings (CA1822 mark members as static, CA2007 ConfigureAwait, CA1848 use LoggerMessage delegates). Which of these should I fix in our controllers and services, and which should I just set to `none` in .editorconfig?
