---
name: tofu-wrapper-routing
description: Planning a new VM through a mise tofu task routes to infra:terraform.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

I want a new VM for Jellyfin in the lab root of our homelab repo. Add it, then run the repo's `mise run tofu lab plan` task with a saved plan file, show me what changes, and wait for my go before anything gets applied.
