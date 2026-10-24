---
name: catchup-next
description: "A what-should-I-do-next question routes to catchup and ends with one labelled Next move."
tags: [routing]
runs: 1
max_turns: 8
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---
I was out for a week and my agent kept going on the auth migration. The log now reads: "swap token store to redis", "drop legacy session table", "wip: rename SessionLease to Grant", and CI on main is red. I can't follow this anymore. What should I do next?
