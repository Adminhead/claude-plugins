---
name: mistake-proof-design
description: "Designing an interface to be hard to misuse should load mistake-proof."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm designing a small Python API for transferring money between accounts: transfer(from_id, to_id, amount, currency). Last quarter someone swapped from_id and to_id and passed cents instead of dollars. Design it so those mistakes can't be made, not just documented.
