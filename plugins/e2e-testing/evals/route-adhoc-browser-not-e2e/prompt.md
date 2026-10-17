---
name: route-adhoc-browser-not-e2e
description: Ad-hoc browser driving with no spec to write does not route to e2e-testing.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Open http://localhost:5173/signup in a browser, submit the form with an empty email, and tell me what error text shows up. Don't write any tests.
