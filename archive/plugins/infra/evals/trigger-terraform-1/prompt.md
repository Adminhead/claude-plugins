---
name: trigger-terraform-1
description: A realistic request that should load infra:terraform.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this terraform plan output before I apply it:

```
  # aws_db_instance.main must be replaced
-/+ resource "aws_db_instance" "main" {
      ~ engine_version = "14.9" -> "15.4" # forces replacement
      ~ id             = "app-prod" -> (known after apply)
    }
  # aws_security_group_rule.db_in will be updated in-place
  ~ resource "aws_security_group_rule" "db_in" {
      ~ cidr_blocks = ["10.0.0.0/16"] -> ["0.0.0.0/0"]
    }

Plan: 1 to add, 1 to change, 1 to destroy.
```
