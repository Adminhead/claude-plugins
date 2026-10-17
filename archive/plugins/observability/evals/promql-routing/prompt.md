---
name: promql-routing
description: Querying a metric routes to observability:promql.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Write a PromQL query for the p95 latency of http_request_duration_seconds by service over the last 5 minutes, and tell me how to check it is not wrong.
