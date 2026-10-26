---
type: llm
weight: 1
---

The user asks for a read-only review of a Terraform change request (CHANGE.md) that widens an ECS task role's IAM policy and renames the role. The request needs the worker to write to, list and clean up the `exports/` prefix of `acme-reports-prod` and read the `reports/db-password` secret; nothing else changes. The repo's role is also used as the task's execution role. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

It gives a least-privilege fix in HCL with specific actions and resource references: no `*` action or `*` resource remains; `secretsmanager:GetSecretValue` (not `secretsmanager:*`) is limited to the `reports/db-password` secret (via `aws_secretsmanager_secret.reports_db.arn` or an ARN); `s3:ListBucket`, if granted, is on the bucket ARN (not on an object ARN); and any new object grants such as delete are limited to the `exports/` prefix or the reports bucket ARN, not `*`. Keeping the existing Get/Put statement is acceptable.
