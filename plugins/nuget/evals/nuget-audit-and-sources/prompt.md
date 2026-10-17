---
name: nuget-audit-and-sources
description: Vulnerability warnings and package source mapping route to nuget, not dependency-vetting.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Restore now shows NU1903 for System.Text.Json 8.0.4 (a transitive dependency) and NU1507 because we have nuget.org plus our internal Azure Artifacts feed in nuget.config. How do I fix the vulnerable transitive package and set up the feeds so internal Contoso.* packages can only come from our feed?
