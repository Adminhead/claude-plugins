---
name: adr-trigger
description: Recording a decision as an ADR routes to adr-writing:adr-writing.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

We decided to use SQLite instead of Postgres for the local job queue, because it needs zero ops and the workload is a single writer. Record that decision as an ADR in docs/adr/.
