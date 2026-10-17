---
name: trigger-terraform-2
description: A realistic request that should load infra:terraform.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I have three aws_s3_bucket resources defined with count and I want to switch them to for_each keyed by name without destroying anything. How do I refactor the .tf and the state?
