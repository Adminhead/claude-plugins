---
name: trigger-context7-1
description: A version-specific migration question should load code-search:context7.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We're moving our app from React Router v6 to v7. What changed in how data loaders and route config are declared? I want the current official guidance for v7.
