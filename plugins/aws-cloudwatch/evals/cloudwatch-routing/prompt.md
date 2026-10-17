---
name: cloudwatch-routing
description: An alarm-driven AWS incident routes to aws-cloudwatch.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our prod-api-5xx CloudWatch alarm went into ALARM about 20 minutes ago in eu-west-1 and the ALB is returning 502s. Profile is prod-readonly. Can you figure out what changed and why?
