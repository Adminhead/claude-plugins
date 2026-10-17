---
name: terragrunt-error-routing
description: A pasted terragrunt dependency error routes to terraform:terraform.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

```
ERROR  Error: Unknown variable
ERROR    on infra/environments/prod/apps/datasource/terragrunt.hcl line 43:
ERROR    43:   host = dependency.database.outputs.reader_endpoint
ERROR  There is no variable named "dependency".
ERROR  resolving dependency "database" outputs: infra/environments/prod/foundation/database/terragrunt.hcl is a dependency of infra/environments/prod/apps/datasource/terragrunt.hcl but detected no outputs.
```
