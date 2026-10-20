---
name: forgejo-issues-routing
description: Filing one issue on Codeberg routes to forgejo-issues:forgejo-issues.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

File an issue on our Codeberg repo acme/widgets: login fails with SSO enabled. Label it bug and put it in the v2.0 milestone.
