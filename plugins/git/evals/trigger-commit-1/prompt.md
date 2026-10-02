---
name: trigger-commit-1
description: A realistic request that should load git:commit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm done with this change and want it recorded in git. The staged diff adds a retry with exponential backoff to `HttpClient.request` in src/http/client.ts (3 attempts, 200ms base), plus a unit test for it in src/http/client.test.ts. The repo uses Conventional Commits.
