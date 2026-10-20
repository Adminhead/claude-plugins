---
name: forgejo-actions-workflow-routing
description: A request for a .forgejo/workflows CI file routes to forgejo-actions:forgejo-actions.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Add .forgejo/workflows/ci.yml that runs go test on push and pull requests on our docker-labelled runner.
