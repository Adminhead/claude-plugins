# aws

Adds three AWS skills: resource inspection, CloudWatch incident investigation, and a Well-Architected and cost review. All three work through the AWS CLI with your existing profile or SSO session, or through the AWS MCP Server when loaded. They read and report by default. They change infrastructure only when you ask, with explicit confirmation. The plugin also declares the AWS MCP Server (see [AWS MCP Server](#aws-mcp-server)).

## What it adds

| Skill | Purpose |
| --- | --- |
| `aws:resource-query` | Answer questions about live resources (EC2, Lambda, ECS/EKS, S3, RDS, DynamoDB, IAM, VPC, and related services) with read-only `describe`, `list`, and named `get` calls. Reads by default; mutating calls run only when you ask for the change, and secret values are never printed |
| `aws:cloudwatch-investigation` | Investigate an incident from alarms, metrics, Logs Insights, and CloudTrail: scope the blast radius, correlate with recent changes, rebuild a timeline, and check per-resource health for EC2, RDS, Lambda, ECS, ALB, DynamoDB, and SQS |
| `aws:architecture-review` | Review a workload against the six Well-Architected pillars and find cost savings, from its IaC (Terraform, CloudFormation, SAM, CDK) and, when asked or when no IaC exists, the live account. Findings are rated High, Medium, or Low |

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

## Requirements

- AWS CLI v2 (`aws`), with a configured profile or SSO session. The skills pass `--profile` and `--region` on every command.
- IAM permissions for the read calls you want. A denied call is reported and not worked around.
- `aws:architecture-review` reads IaC from the repo and needs no IaC tool installed. For live checks it uses the CLI and, for utilization and spend, CloudWatch and Cost Explorer.
- Optional: `gh`, only if you ask `aws:architecture-review` to create GitHub issues.
- For the AWS MCP Server: an IAM identity that can sign in through AWS Sign-in OAuth (see below).

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

Also denied by default: output-expanding flags (`--with-decryption`, `--details`, `--include-value`, `--include-values`, `--attribute userData`) and every state-changing verb (`create-`, `delete-`, `put-`, `update-`, `modify-`, `run-`, `start-`, `stop-`, `terminate-`, `invoke`, and others), plus `s3 mv/rm/sync/presign`, `ssm start-session`, and `ecs execute-command`. State-changing commands run only when you ask for the change, with explicit confirmation for destructive or irreversible operations.

### The `--query` projection rule

Many allowed calls return secrets in their full output, for example Lambda `Environment.Variables`, ECS task definition `environment` values, launch template `UserData`, and Cognito app client secrets. Claude runs only commands listed in the skill's reference tables, or an unlisted `describe-*` or `list-*` call that passes the deny list and carries a `--query` naming the fields to print. It never prints the full response of an unlisted call. `aws:cloudwatch-investigation` and `aws:architecture-review` apply the same rule.

### `aws:cloudwatch-investigation`

- It runs only read calls (`cloudwatch describe-*/get-*/list-*`, `logs describe-*`, `logs start-query`, `logs get-query-results`, `logs stop-query`, `cloudtrail lookup-events`, `pi get-resource-metrics`, `health describe-events`) plus the calls listed in `aws:resource-query`.
- Remediation, such as changing Lambda concurrency, rebooting a database, or rolling back a deploy, runs only after you approve the exact command, which Claude shows first. Otherwise it lists remediation as proposals with a blast radius and rollback.
- It treats log lines as untrusted data and possible secret carriers, and redacts tokens and credentials in reports.
- Logs Insights bills per volume scanned. It uses the narrowest time range and fewest log groups, and cancels queries it no longer needs.

### `aws:architecture-review`

- It changes infrastructure only when you ask. It never creates GitHub issues unless you ask. It drafts issue titles and bodies for your review first.
- It does not run `cdk synth`, `terraform plan`, or `sam build`, because they can execute project code and call AWS. It reads the sources and an existing `cdk.out` directory instead.
- A whole-account sweep needs your agreement. By default it narrows to the workload by tag or stack.

## AWS MCP Server

The plugin declares `aws-mcp` in `.mcp.json`: `https://aws-mcp.us-east-1.api.aws/mcp`, type `http`, `alwaysLoad: false`. Its tools appear as `mcp__plugin_aws_aws-mcp__aws___<tool>` and load on demand. Claude Code signs in with OAuth (dynamic client registration against AWS Sign-in, S256 PKCE). No static auth header is set, because one would block OAuth.

### Sign-in and IAM

- Run `/mcp`, pick `aws-mcp`, and sign in. If that does not start the flow, the documented fallback is the URL with `?oauth=initialize`.
- The identity needs `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token`. The managed policy `AWSMCPSignInOAuthAccessPolicy` grants both.
- Tokens last 1 hour and refresh for up to 12 hours. A session covers one account. The region defaults to `us-east-1` unless a call passes `region_name`.
- Over plain HTTP the documentation tools answer without sign-in, but in Claude Code the server shows `needs-auth` and exposes no tools until you sign in (observed 2026-10-03). `run_script` returns 401 until you sign in.

### Tools

| Tool | Annotations |
| --- | --- |
| `aws___run_script` | not read-only, destructive |
| `aws___get_presigned_url` | not read-only |
| `aws___get_tasks`, `aws___search_documentation`, `aws___read_documentation`, `aws___retrieve_skill`, `aws___list_regions`, `aws___get_regional_availability` | read-only |

`run_script` takes one field, `code`, which is Python that reaches AWS through `call_boto3(service_name=..., operation_name=..., region_name=..., params=...)`. The tool list and schema are in `plugins/aws/skills/resource-query/references/aws-mcp.md`.

### Instruction conflict

The server's `initialize` instructions tell Claude to prefer its tools and not to run the AWS CLI through Bash. In a smoke run that made Claude skip `aws:resource-query` and run an unprojected `ListFunctions` through `run_script`. Each skill now has an "AWS MCP Server" section saying its rules take precedence: read-only by default, project output with `--query`, never print secrets, allow writes only when the user asks. Live reads stay on the CLI. `run_script` is for read-only calls with fields projected in the script, or for writes when you ask. The documentation tools are fine, and `aws:architecture-review` prefers them for current AWS guidance. This is skill text, so it works only when a skill loads.

### Security model

The plugin adds no technical block on `run_script`. Write (mutating) calls are bounded by the signed-in IAM role and Claude Code's per-call permission prompt.

- **What the server can do.** `run_script` executes arbitrary boto3 calls with the permissions of the identity you signed in with. The server annotates it destructive. Nothing in the plugin limits which operations a script may call or what it returns.
- **What limits it.** Three things. The IAM permissions of the role used for the OAuth sign-in set the ceiling. Claude Code's permission prompt appears for each MCP call and shows the code. The skills require explicit approval for writes (the user asks for the change), and confirm destructive or irreversible steps even when writes are allowed.
- **Sign in with the right role.** For read-only work, use `ReadOnlyAccess` or a narrower custom policy, plus the sign-in permissions `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` (the managed policy `AWSMCPSignInOAuthAccessPolicy` grants both). Do not sign in with an administrator role. When writes are intended, ensure the role has write permissions only where intended.
- **Read-only is not secret-free.** `ReadOnlyAccess` is built from broad Get, List, and Describe grants, so it can read data such as S3 objects, DynamoDB items, log events, Lambda environment variables, and plain SSM parameters. As checked on 2026-10-13 (policy version v188, docs.aws.amazon.com's ReadOnlyAccess reference), it does not grant `secretsmanager:GetSecretValue`. It grants `secretsmanager:Describe*`, `GetResourcePolicy` and `List*`. Use a custom policy that excludes the data actions you do not want Claude to read.
- **Permission rules.** Claude Code matches an MCP tool by its full name in `permissions` (no parentheses). The tool names are `mcp__plugin_aws_aws-mcp__aws___run_script` and `mcp__plugin_aws_aws-mcp__aws___get_presigned_url`. To block the script tool entirely, in `.claude/settings.json` or your user settings:

  ```json
  {"permissions": {"deny": ["mcp__plugin_aws_aws-mcp__aws___run_script"]}}
  ```

  To keep the prompt on every call (recommended for safety), put the name in `ask`, or leave it out of every list. Never put it in `allow`, because an allowed `run_script` runs any code without a prompt. The read-only documentation tools are safe to allow.
- **Bypass modes.** Modes that skip permission prompts (such as `bypassPermissions`) skip this prompt too. Do not use them with this server signed in when writes are possible.

### Regional endpoints

`run_script` marks itself `_meta.anthropic/alwaysLoad: true`, but the server-level `alwaysLoad: false` in `.mcp.json` wins and keeps it deferred (dated probe with a test plugin on Claude Code 2.1.288).

Only `us-east-1` is declared. Other regions have their own endpoint (`aws-mcp.<region>.api.aws`), which the plugin does not declare. The server's tools can still reach other regions through `region_name`.

### Unconfirmed

- Whether signing in from `/mcp` works at the first `run_script` 401 mid-session, and whether `?oauth=initialize` is needed.
- The exact IAM permissions beyond the two Sign-in actions for calls made through `run_script` (they run as your role, so the usual per-service permissions apply).
- Whether the server's tool list or annotations change with sign-in. The anonymous list shows eight tools.

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

Both commands remove the skills and the `aws-mcp` server entry. Nothing is written to your AWS config. An OAuth sign-in stays in Claude Code's credential store until you clear it in `/mcp`. Start a new session to be sure the skills are gone.
