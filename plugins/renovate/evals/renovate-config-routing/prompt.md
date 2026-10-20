---
name: renovate-config-routing
description: A request to set up Renovate on a Forgejo instance routes to renovate:renovate, not dependabot.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Set up Renovate for this repo on our Forgejo instance: group minor and patch updates and run weekly.
