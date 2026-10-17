---
name: terraform-routing
description: Reviewing a Terraform plan routes to terraform:terraform.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Here is the output of `terraform plan`: 2 to add, 1 to change, 1 to destroy and replace (aws_db_instance.main, forces replacement because engine_version changed). Review it and tell me whether it is safe to apply.
