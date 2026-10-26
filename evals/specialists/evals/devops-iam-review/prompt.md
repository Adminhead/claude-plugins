---
name: devops-iam-review
description: "devops as session agent: read-only review of a Terraform change request that touches IAM."
tags: [outcome, specialists, devops]
plugins: ["../../fixtures/devops-main", "../../../../plugins/devops", "../../../../plugins/terraform"]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Review the change request in CHANGE.md against the Terraform in infra/. Tell me what to change before it merges, with the corrected HCL. Don't edit files and don't apply anything; we have no credentials here.
