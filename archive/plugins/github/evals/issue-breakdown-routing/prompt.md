---
name: issue-breakdown-routing
description: Splitting a spec into linked issues routes to github:issue-breakdown.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Here is our spec for CSV export: users pick columns, the server streams the file, large exports run as background jobs, and admins get an audit log. Turn it into a set of linked GitHub issues cut as vertical slices, with blocking edges. Show me the plan before creating anything.
