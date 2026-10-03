---
name: grep-app-vs-ripgrep
description: A request to see how real projects call an API across GitHub routes to grep-app, not ripgrep.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm about to use `getServerSession(` from next-auth in a Next.js route handler and I'm not sure how people usually pass authOptions around. Can you find a few examples from popular open source projects on GitHub so I can see the common patterns before I write mine?
