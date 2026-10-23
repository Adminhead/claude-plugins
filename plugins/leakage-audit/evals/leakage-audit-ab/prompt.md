---
name: leakage-audit-ab
description: "An is-this-A/B-measuring-anything question routes to leakage-audit."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Is this A/B design actually measuring anything? The model picks the winner and the same model scores it.
