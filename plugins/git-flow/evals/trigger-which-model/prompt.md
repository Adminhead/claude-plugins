---
name: trigger-which-model
description: A model-choice question with the repo's current behaviour described routes to git-flow, which now covers trunk-based too.
tags: [routing]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

should this repo use trunk-based or git-flow? here is what we do today: one main branch, every change is a PR against it, we deploy to production from main several times a day, there is no develop branch, and a release is just a tag. one on-prem customer is pinned to 3.2 and we backport fixes to them now and then.
