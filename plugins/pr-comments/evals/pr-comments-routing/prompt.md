---
name: pr-comments-routing
description: Handling review threads routes to pr-comments:pr-comments.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

PR #214 has review comments from two people. Get the unresolved review threads, summarise what they want, and let me pick which ones to fix.
