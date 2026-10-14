---
name: production-readiness-vs-rollout
description: A pre-launch look at a repo for gaps routes to production-readiness, not rollout.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We are launching the invoicing service on Thursday. Go through the repo and tell me whether it is in good enough shape to go out. Look at the migrations, the CI setup, the health checks, how we would undo a bad release, and anything else you think is missing, and say which parts you actually looked at and which you could not confirm.
