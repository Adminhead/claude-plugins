---
name: redis-vs-postgres
description: A per-user sliding-window rate limiter on Redis routes to redis.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need a per-user rate limiter of 100 requests per minute for our API, shared across 6 app instances, using Redis. Should I use a fixed window with INCR and EXPIRE or a sliding window with a sorted set, and how do I make the check-and-increment atomic?
