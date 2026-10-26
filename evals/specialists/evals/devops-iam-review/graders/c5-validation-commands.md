---
type: llm
weight: 1
---

The user asks for a read-only review of a Terraform change request (CHANGE.md) that widens an ECS task role's IAM policy and renames the role. The request needs the worker to write to, list and clean up the `exports/` prefix of `acme-reports-prod` and read the `reports/db-password` secret; nothing else changes. The repo's role is also used as the task's execution role. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

It names concrete validation commands for the corrected change, such as `terraform fmt -check`, `terraform init -backend=false`, `terraform validate` (or the `tofu` equivalents), and says that a `plan` needs credentials or CI and was not run here.
