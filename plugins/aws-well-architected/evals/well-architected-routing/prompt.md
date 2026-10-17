---
name: well-architected-routing
description: A Well-Architected and cost review request routes to aws-well-architected.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Can you do a Well-Architected review of the infra/ Terraform in this repo and point out where we're overspending on RDS and EC2?
