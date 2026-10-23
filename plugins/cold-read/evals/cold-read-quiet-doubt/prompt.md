---
name: cold-read-quiet-doubt
description: "Near miss: attacking a decision belongs to doubt-review, not cold-read."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Adversarially review my decision to drop Redis and move sessions into Postgres.
