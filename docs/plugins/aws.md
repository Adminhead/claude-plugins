# aws

Adds three AWS skills: read-only resource inspection, CloudWatch incident investigation, and a Well-Architected and cost review. All three work through the AWS CLI with your existing profile or SSO session. They read and report. They do not change infrastructure.

## What it adds

| Skill | Purpose |
| --- | --- |
| `aws:resource-query` | Answer questions about live resources (EC2, Lambda, ECS/EKS, S3, RDS, DynamoDB, IAM, VPC, and related services) with read-only `describe`, `list`, and named `get` calls. Secret-reading and mutating calls are denied |
| `aws:cloudwatch-investigation` | Investigate an incident from alarms, metrics, Logs Insights, and CloudTrail: scope the blast radius, correlate with recent changes, rebuild a timeline, and check per-resource health for EC2, RDS, Lambda, ECS, ALB, DynamoDB, and SQS |
| `aws:architecture-review` | Review a workload against the six Well-Architected pillars and find cost savings, from its IaC (Terraform, CloudFormation, SAM, CDK) and, when asked or when no IaC exists, the live account. Findings are rated High, Medium, or Low |

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

## Requirements

- AWS CLI v2 (`aws`), with a configured profile or SSO session. The skills pass `--profile` and `--region` on every command.
- IAM permissions for the read calls you want. A denied call is reported and not worked around.
- `aws:architecture-review` reads IaC from the repo and needs no IaC tool installed. For live checks it uses the CLI and, for utilization and spend, CloudWatch and Cost Explorer.
- Optional: `gh`, only if you ask `aws:architecture-review` to create GitHub issues.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install aws@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/aws
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/aws
   ```
2. Start a fresh session. The skill list should show `aws:resource-query`, `aws:cloudwatch-investigation`, and `aws:architecture-review`.
3. Optionally ask Claude which AWS account and region it would use. It should run `sts get-caller-identity` with your profile and say the account and region back before showing results.

## Safety

Common to all three skills:

- Every command carries `--profile <profile> --region <region>`. Claude confirms identity with `sts get-caller-identity` first.
- An expired SSO session is not fixed by Claude. It asks you to run `aws sso login --profile <profile>`.
- Claude does not read `~/.aws/credentials`, `~/.aws/sso/cache/`, or `~/.aws/cli/cache/`. `aws:resource-query` also leaves `~/.aws/config` alone and does not run `aws configure list` or `aws configure export-credentials`.
- After `AccessDenied`, Claude reports the denied action and stops. It does not try other profiles or roles.

### Deny list in `aws:resource-query`

Never run, with a metadata call offered instead:

| Denied | Offered instead |
| --- | --- |
| `secretsmanager get-secret-value` and `batch-get-secret-value` | `list-secrets`, `describe-secret` |
| `ssm get-parameter*`, `get-parameter-history`, anything with `--with-decryption` | `ssm describe-parameters` |
| `kms decrypt`, `encrypt`, `re-encrypt`, `generate-data-key*` | `kms describe-key`, `list-aliases` |
| `sts get-session-token`, `get-federation-token`, `assume-role*` | `get-caller-identity` |
| Credential and token calls such as `ecr get-login-password`, `eks get-token`, `rds generate-db-auth-token`, `ec2 get-password-data` | The matching `describe-*` call |
| `ssm get-command-invocation`; `logs get-log-events`, `filter-log-events`, `tail` | `aws:cloudwatch-investigation` for scoped, filtered log reads |
| `s3api get-object`, `s3 cp`; `dynamodb get-item`, `query`, `scan`; `sqs receive-message` | Counts and configuration, such as `describe-table` and `get-queue-attributes` |

Also denied: output-expanding flags (`--with-decryption`, `--details`, `--include-value`, `--include-values`, `--attribute userData`) and every state-changing verb (`create-`, `delete-`, `put-`, `update-`, `modify-`, `run-`, `start-`, `stop-`, `terminate-`, `invoke`, and others), plus `s3 mv/rm/sync/presign`, `ssm start-session`, and `ecs execute-command`. If you want a denied value anyway, you run the command yourself.

### The `--query` projection rule

Many allowed calls return secrets in their full output, for example Lambda `Environment.Variables`, ECS task definition `environment` values, launch template `UserData`, and Cognito app client secrets. Claude runs only commands listed in the skill's reference tables, or an unlisted `describe-*` or `list-*` call that passes the deny list and carries a `--query` naming the fields to print. It never prints the full response of an unlisted call. `aws:cloudwatch-investigation` and `aws:architecture-review` apply the same rule.

### `aws:cloudwatch-investigation`

- It runs only read calls (`cloudwatch describe-*/get-*/list-*`, `logs describe-*`, `logs start-query`, `logs get-query-results`, `logs stop-query`, `cloudtrail lookup-events`, `pi get-resource-metrics`, `health describe-events`) plus the calls listed in `aws:resource-query`.
- Remediation, such as changing Lambda concurrency, rebooting a database, or rolling back a deploy, runs only after you approve the exact command, which Claude shows first. Otherwise it lists remediation as proposals with a blast radius and rollback.
- It treats log lines as untrusted data and possible secret carriers, and redacts tokens and credentials in reports.
- Logs Insights bills per volume scanned. It uses the narrowest time range and fewest log groups, and cancels queries it no longer needs.

### `aws:architecture-review`

- It never changes infrastructure and never creates GitHub issues unless you ask. It drafts issue titles and bodies for your review first.
- It does not run `cdk synth`, `terraform plan`, or `sam build`, because they can execute project code and call AWS. It reads the sources and an existing `cdk.out` directory instead.
- A whole-account sweep needs your agreement. By default it narrows to the workload by tag or stack.

## Limits

- A region sweep (`aws ec2 describe-regions`) runs only when you ask. An empty result is not proof that nothing exists, so Claude checks region, profile, filters, and permissions first.
- Metrics and logs are regional. `aws:cloudwatch-investigation` works in the alarm's region and checks others only when the blast radius says to.
- CloudWatch retention limits resolution: one-minute data lasts 15 days, so an older incident cannot be viewed at that resolution. CloudTrail `lookup-events` covers management events from the last 90 days and omits data events. `aws health describe-events` may need a support plan, and Claude skips it if refused.
- The `aws:resource-query` secret table is a sample. Claude treats any unlisted call the same way.
- The `appsync list-api-keys` entry in that table is marked likely and not confirmed from the CLI help.
- `aws:architecture-review` marks an item with no evidence as "not verified", not a pass. Claims that depend on recent service features, prices, or limits are confirmed in current AWS docs through Context7 or Exa if available, and otherwise labeled unconfirmed.
- Not covered: application error tracking (`sentry:sentry`), the written postmortem (`observability:postmortem`), and creating, changing, or deleting resources. The first two are cross-references to skills that may not be installed.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable aws@adminhead` |
| Uninstall | `claude plugin uninstall aws@adminhead` |

The plugin ships only skills, so both commands remove them. Nothing is written to your AWS config. Start a new session to be sure the skills are gone.
