---
name: resource-query
description: Answer questions about live AWS resources with read-only AWS CLI commands (describe, list, and named get calls) across EC2, Lambda, ECS/EKS, S3, RDS, DynamoDB, IAM, VPC, and related services, using the user's existing profile or SSO session. Reads by default; mutating calls run only when the user asks for the change, and secret values are never printed. Use when asked what exists in an AWS account or region, how a resource is configured, or what state it is in now. Not for incident triage from logs and metrics (aws:cloudwatch-investigation), Well-Architected or cost review (aws:architecture-review), or planning infrastructure as code.
---

# AWS resource query

Translate a question about an AWS account into AWS CLI commands, run them, and report what exists. Reads by default; changes a resource only when the user asks (see Changes). Never prints a secret value.

## Before the first command

1. **Pick the profile.** Use the profile the user names, else `AWS_PROFILE` if set. Otherwise run `aws configure list-profiles` and ask which one. Pass `--profile <profile> --region <region>` on every command rather than exporting variables, so one query can't leak into the next.
2. **Pick the region.** Use the region the user names, else `aws configure get region --profile <profile>`. If neither gives one, ask. IAM, Route 53, CloudFront, and S3 bucket listing are account-wide, so region does not matter for them. A sweep across regions (`aws ec2 describe-regions`) happens only when the user asks.
3. **Confirm the identity** and say account and region back before showing results:

   ```bash
   aws sts get-caller-identity --profile <profile> --query '{Account:Account,Arn:Arn}' --output table
   ```

4. **Handle expired sessions by asking.** If the call reports an expired or missing SSO session, ask the user to run `aws sso login --profile <profile>`. The login is interactive and belongs to the user.
5. **Leave credentials alone.** Do not read `~/.aws/credentials`, `~/.aws/config`, `~/.aws/sso/cache/`, or `~/.aws/cli/cache/` directly, and do not run `aws configure list` or `aws configure export-credentials`, which can print key material. `aws configure get` is for `region` and `output` only.

## What may run

Run only a command that is in the tables under `references/`, or an unlisted `describe-*` or `list-*` call that passes the deny list below and carries a `--query` naming the fields to print. Never print the full response of an unlisted call, because many describe and list calls return secrets by default. A `get-*` prefix is not enough on its own either, since several `get-*` verbs return secrets.

Always denied, with the metadata alternative to offer instead:

| Denied | Why | Offer instead |
| --- | --- | --- |
| `secretsmanager get-secret-value`, `batch-get-secret-value` | Returns the secret | `list-secrets`, `describe-secret` |
| `ssm get-parameter`, `get-parameters`, `get-parameters-by-path`, `get-parameter-history` (and anything with `--with-decryption`) | Returns parameter values, decrypted on request | `ssm describe-parameters` |
| `kms decrypt`, `encrypt`, `re-encrypt`, `generate-data-key*` | Handles key material or plaintext | `kms describe-key`, `list-aliases` |
| `sts get-session-token`, `get-federation-token`, `assume-role*` | Mints credentials | `get-caller-identity` |
| `ecr get-login-password`, `get-authorization-token`; `codeartifact get-authorization-token`; `eks get-token`; `rds generate-db-auth-token`; `redshift get-cluster-credentials*`; `ec2 get-password-data`; `lightsail get-instance-access-details` | Returns a credential or token | The matching `describe-*` call |
| `ssm get-command-invocation`; `logs get-log-events`, `filter-log-events`, `tail` | Output and log lines often contain secrets | `aws:cloudwatch-investigation` for logs, scoped and filtered |
| `s3api get-object`, `s3 cp`; `dynamodb get-item`, `query`, `scan`; `sqs receive-message` | Reads data, not metadata (`receive-message` also hides messages from other consumers) | Counts and configuration (`describe-table`, `get-queue-attributes`) |

Output-expanding flags are denied on every command: `--with-decryption`, `--details` (for example `ssm list-command-invocations --details`, which adds command output), `--include-value` and `--include-values`, and `--attribute userData`.

State-changing commands (any `create-`, `delete-`, `put-`, `update-`, `modify-`, `run-`, `start-`, `stop-`, `terminate-`, `reboot-`, `attach-`, `detach-`, `associate-`, `disassociate-`, `tag-`, `untag-`, `enable-`, `disable-`, `send-`, `publish-`, `execute-`, `purge-`, `invoke`, `generate-` verb, plus `s3 mv/rm/sync/presign`, `ssm start-session`, and `ecs execute-command`) run only when the user asks for that change (see Changes). Query-starting calls (`logs start-query`, `athena start-query-execution`, `cloudtrail start-query`) change nothing but bill by data scanned, so they go through `aws:cloudwatch-investigation`.

When a request needs a secret-reading, data-reading, or output-expanding call, say this skill does not read that data, name the metadata alternative, and stop. If the user wants the value anyway, they can run the command themselves.

Some allowed calls return secrets inside their full output. Print them only with a `--query` that names safe fields (`references/compute.md` shows the Lambda and ECS projections):

| Call | Secret in the full output |
| --- | --- |
| `lambda list-functions`, `get-function-configuration` | `Environment.Variables` |
| `ecs describe-task-definition` | Container `environment` values |
| `ecs describe-tasks` | `overrides.containerOverrides[].environment` |
| `ec2 describe-launch-template-versions`; `autoscaling describe-launch-configurations`; `ec2 describe-instance-attribute --attribute userData` | `UserData` scripts |
| `elasticbeanstalk describe-configuration-settings` | Environment `OptionSettings` values |
| `batch describe-job-definitions` | Container `environment` and `secrets` |
| `apprunner describe-service` | `RuntimeEnvironmentVariables` |
| `amplify list-apps` | `basicAuthCredentials`, `environmentVariables` |
| `cognito-idp describe-user-pool-client` | `ClientSecret` |
| `cloudformation describe-stacks` | Parameter and output values (parameters not marked `NoEcho`) |
| `ssm list-commands` | Command `Parameters` |
| `stepfunctions describe-execution` | Execution `input` and `output` |
| `wafv2 list-api-keys` | `APIKey` |
| `appsync list-api-keys` | The key is the `id` field (likely, not confirmed from the CLI help) |

This list is a sample. Treat any unlisted call the same way.

## Changes

State-changing commands run only when the user asks for that change. Rules:

- **Scope**: Limit to exactly the requested change. State the account, profile, region, and affected resources before running.
- **Show first**: Display the exact operation (the CLI command or script) before executing it, and wait for approval.
- **DryRun**: Use `--dry-run` or equivalent (EC2 and others support it) for risky changes.
- **Confirm destructive steps**: Explicitly confirm before delete, terminate, overwrite, IAM/permission changes, or public exposure.
- **Verify after**: Run a read command afterwards to confirm the change and report what changed.
- **Never print secrets**: Secrets stay redacted in output, regardless.

## AWS MCP Server

When the `aws-mcp` tools are loaded (`mcp__plugin_aws_aws-mcp__*`), this skill's rules take precedence over the server's own instruction to prefer its tools and avoid the AWS CLI. The server does not know this skill's deny list, and nothing else in the plugin enforces it.

- Run live reads with the AWS CLI and a `--query` projection, as above.
- If you use `aws___run_script`, make read-only calls and project fields inside the script. Never return a whole response for Lambda, ECS, CloudFormation, or EC2 user data. Never call a secret-reading or data-reading operation unless the user asked for it. Write (mutating) calls through `aws___run_script` follow the Changes section above: show the exact operations (the script) before running, scope to the requested change, and follow all other rules. Each call shows the user a permission prompt with the code.
- The documentation and region tools (`search_documentation`, `read_documentation`, `retrieve_skill`, `list_regions`, `get_regional_availability`) are fine to use.
- `references/aws-mcp.md` has the tool list, the security model, and sign-in setup.

## Shaping output

- Use `--query` (JMESPath) to pick fields and `--output table` for lists. Use `--output json` only when the user wants full detail, and then still drop environment variables.
- Count before listing when a result may be large. Take identifiers as text and count them, for example `--query 'Reservations[].Instances[].InstanceId' --output text | wc -w`. Above about 20 items, show the count and ask how to filter (state, tag, type) instead of printing everything.
- The CLI follows pagination tokens by default. Cap output with `--max-items <n>`, and use `--page-size <n>` if a call times out. `ecs describe-services` accepts at most 10 service names per call.
- Add `--no-cli-pager` so output reaches you, not a pager.
- Quote user-supplied names and identifiers in single quotes.
- An empty result is not proof that nothing exists. Check region, profile and account, filters, and permissions before saying so.

## Choosing a reference

Read the one that matches the question. Each lists intent-to-command mappings.

- `references/compute.md` for EC2, Auto Scaling, Lambda, ECS, EKS, and Batch.
- `references/storage-and-data.md` for S3, EBS, EFS, RDS, DynamoDB, ElastiCache, and Redshift.
- `references/network.md` for VPC, subnets, security groups, load balancers, Route 53, and CloudFront.
- `references/identity-and-security.md` for IAM, KMS, Secrets Manager and SSM metadata, ACM, GuardDuty, Security Hub, and Config.
- `references/ops-and-cost.md` for alarms, log groups, CloudTrail, queues and topics, EventBridge, API Gateway, Step Functions, tag-based search, Cost Explorer, and Budgets.
- `references/aws-mcp.md` for the AWS MCP Server tools, its security model, and sign-in.

## Errors

| Symptom | Response |
| --- | --- |
| `AccessDenied`, `AccessDeniedException`, `UnauthorizedOperation` | Report the denied action (the message names it) and stop. Do not try other profiles or roles. |
| `ExpiredToken`, expired SSO session | Ask the user to run `aws sso login --profile <profile>`. |
| `Unable to locate credentials` | The profile is wrong or empty. Run `aws configure list-profiles` and ask. |
| `Could not connect to the endpoint URL` | Check the region name and the service's availability there. |
| `ThrottlingException`, `RequestLimitExceeded` | Wait, then retry with a smaller `--page-size` or fewer calls. |
| `NoSuchEntity`, `ResourceNotFoundException`, `NoSuchBucket` | Check the name, region, and account before concluding it is gone. |
| `argument operation: Found invalid choice` | The CLI is too old or the verb is misspelled. Check `aws --version` (v2 expected). |

## Report

State the account, region, and profile used, then the findings as a table or short list, and name any command the deny list stopped. Offer one next filter or drill-down.
