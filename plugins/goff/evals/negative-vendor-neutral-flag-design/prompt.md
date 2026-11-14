---
name: negative-vendor-neutral-flag-design
description: Hard negative. A vendor-neutral feature-flag design question with no tool chosen belongs to feature-flags, not goff.
tags: [routing]
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

we're about to ship a risky rewrite of our checkout behind a feature flag and haven't picked a flag tool yet. how should I structure it: what default to use, how to test both paths, and how do we make sure the flag actually gets removed afterwards?
