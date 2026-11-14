---
name: negative-other-vendor
description: Hard negative. Flag work on a different vendor (LaunchDarkly) shares the vocabulary but is not for goff.
tags: [routing]
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

in our LaunchDarkly project I need a targeting rule for `new-search-ranking` that serves the new variation to users whose `plan` is pro, rolls it out to 25% of everyone else, and has a prerequisite on the `search-index-v2` flag. how do I set that up, and what would the Python server SDK call look like?
