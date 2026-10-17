---
name: ship-routing
description: A request to land finished work on main through a PR routes to ship:ship, not gh-pr:gh-pr.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

The fix on my branch fix/retry-backoff is done and tested. Get it all the way into main for me: commit it, push, make the pull request, wait for CI, and merge once it's green.
