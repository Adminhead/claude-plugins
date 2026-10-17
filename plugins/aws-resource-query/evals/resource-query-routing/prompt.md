---
name: resource-query-routing
description: Inspecting live AWS resources routes to aws-resource-query.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

What EC2 instances are currently running in us-east-1 with my default profile, and what security groups are attached to each?
