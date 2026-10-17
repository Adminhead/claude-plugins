---
name: dependabot-sweep-routing
description: A request to merge the open Dependabot PRs routes to dependabot:dependabot, not gh-pr or gh-triage.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Run through all the open Dependabot PRs on this repo and start merging the ones that pass.
