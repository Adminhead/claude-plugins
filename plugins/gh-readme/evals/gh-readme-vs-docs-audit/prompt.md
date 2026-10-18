---
name: gh-readme-vs-docs-audit
description: "Checking docs/ and the config reference for drift after a refactor does not load gh-readme (docs-audit owns it)."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We renamed half the environment variables and moved the config loader in last week's refactor. Go through docs/configuration.md, docs/deploy.md and the API reference and list everything that no longer matches the code, with file and line.
