---
type: llm
weight: 1
---

The user asks for a read-only review of a Terraform change request (CHANGE.md) that widens an ECS task role's IAM policy and renames the role. The request needs the worker to write to, list and clean up the `exports/` prefix of `acme-reports-prod` and read the `reports/db-password` secret; nothing else changes. The repo's role is also used as the task's execution role. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

It flags that renaming the role (`name` changes from `reports-worker` to `reports-worker-role`) forces replacement of `aws_iam_role.worker` (destroy and create), says what depends on it (the task definition's task and execution roles, the running ECS service), and recommends dropping the rename or planning the replacement separately.
