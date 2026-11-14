---
name: value-concede-what-holds
description: Value case. A decision with three well-evidenced legs and one real weak spot, and a request to poke holes; a good critique accepts what holds and attacks only what does not.
tags: [value]
runs: 3
max_turns: 6
allowed_tools: [Skill]
---

we're keeping our background jobs on Postgres (a jobs table with FOR UPDATE SKIP LOCKED) instead of adding SQS. my reasons: peak is about 300 jobs/s and I benchmarked 4,000 jobs/s on our production instance size last week; every job is idempotent so at-least-once delivery is fine; the team has run Postgres for eight years and nobody has AWS messaging experience; and keeping the table in the main app database means no second backup and restore story. play devil's advocate and poke holes in this decision.
