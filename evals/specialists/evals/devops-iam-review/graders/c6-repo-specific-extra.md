---
type: llm
weight: 1
---

The user asks for a read-only review of a Terraform change request (CHANGE.md) that widens an ECS task role's IAM policy and renames the role. The request needs the worker to write to, list and clean up the `exports/` prefix of `acme-reports-prod` and read the `reports/db-password` secret; nothing else changes. The repo's role is also used as the task's execution role. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

It notes at least one further issue visible in this repo beyond the items above: the task role is reused as the execution role (which then also needs ECR and log permissions, or should be split), the wildcard may be a symptom of a missing permission it should name, or similar. A generic remark that does not refer to this repo does not count.
