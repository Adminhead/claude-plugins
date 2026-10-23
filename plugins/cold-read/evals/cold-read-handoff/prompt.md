---
name: cold-read-handoff
description: "A fresh-eyes check before a handoff routes to cold-read."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I have been staring at this design doc for hours and cannot tell any more whether it makes sense on its own. Get me a fresh-eyes read before I hand it off.

```
# Retry queue design

We replace the cron poller with a queue. Jobs go to `jobs.ready`, and workers ack them.
On failure the job is requeued with the usual backoff, so the dead-letter path from the earlier design still applies.
Idempotency keys follow the rules we agreed last quarter.
```
