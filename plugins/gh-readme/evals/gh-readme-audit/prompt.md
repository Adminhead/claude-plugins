---
name: gh-readme-audit
description: "A casual front-page review request routes to gh-readme:gh-readme."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

people keep landing on our repo and bouncing, i think the readme is the problem. it opens with like 11 badges and a giant logo and you have to scroll forever to find out what the library even does. can you review it and tell me what to fix first?
