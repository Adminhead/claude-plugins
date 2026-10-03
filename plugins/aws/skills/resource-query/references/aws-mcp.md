# AWS MCP Server

The plugin declares the official AWS MCP Server as `aws-mcp` (`https://aws-mcp.us-east-1.api.aws/mcp`, HTTP, OAuth). Tool names carry the plugin scope: `mcp__plugin_aws_aws-mcp__aws___<tool>`. The server is not always loaded (`alwaysLoad: false`), so its tools may need to be fetched first.

## Precedence

The server's `initialize` response says to prefer its tools and "Do NOT use the Bash tool to run the AWS CLI". That instruction does not know the deny list or the `--query` rule in `SKILL.md`. In this plugin the skills win:

- Live reads use the AWS CLI with `--profile`, `--region` and a `--query` projection.
- `aws___run_script` is for read-only operations, with the script returning only the fields needed. See the security model below.
- The documentation and region tools need no special care.

## Tools

Annotations are as the server reports them (anonymous `tools/list`, 2026-10-03). Tool descriptions can change.

| Tool | Annotations | Use |
| --- | --- | --- |
| `aws___run_script` | `readOnlyHint: false`, `destructiveHint: true` | Runs sandboxed Python with AWS access through `call_boto3`. Needs sign-in. Each call prompts |
| `aws___get_presigned_url` | `readOnlyHint: false` | Presigned S3 upload or download URLs |
| `aws___get_tasks` | read-only | Polls a long-running task by `task_ids` |
| `aws___search_documentation` | read-only | Searches AWS documentation. Returns verbatim page chunks. Works without sign-in |
| `aws___read_documentation` | read-only | Fetches full documentation pages as Markdown |
| `aws___retrieve_skill` | read-only | Fetches an AWS skill by the `skill_name` that `search_documentation` returns |
| `aws___list_regions` | read-only | Lists regions |
| `aws___get_regional_availability` | read-only | Service, API, or CloudFormation resource availability per region |

## `run_script` input

One field: `code` (string, required, no other properties). The code is Python that reaches AWS only through:

```python
async def call_boto3(*, service_name: str, operation_name: str,
                     region_name: str | None = None, params: dict | None = None) -> dict
```

`operation_name` is the PascalCase API operation, for example `ListBuckets`. The server also corrects a snake_case name at runtime. The response includes an `api_calls` list. Every call needs a literal `service_name` and `operation_name`. `aws_mcp.search_functions(...)` and other `aws_mcp` helpers wrap AWS calls in ways a reader of the code cannot see.

## Security model

The plugin adds no technical block on `run_script`. The script runs arbitrary boto3 calls with the permissions of the signed-in identity, and the server annotates the tool destructive. The effective limits are the IAM role used for the OAuth sign-in and Claude Code's permission prompt on each MCP call, which shows the code.

Rules for Claude, which hold even when the prompt is approved:

- Read-only is the default. Make read-only calls and only the ones the question needs. Mutating (write) calls run only when the user asks for that change, or has allowed the tool for writes.
- Project fields inside the script and return those. Never return a whole response for Lambda (`ListFunctions`, `GetFunction`, `GetFunctionConfiguration`), ECS task definitions, CloudFormation (`DescribeStacks`, `GetTemplate`), EC2 launch templates, user data, Step Functions executions, or any other call in the `SKILL.md` "secrets in full output" table.
- Do not call secret-reading operations (`GetSecretValue`, `GetParameter*`, `Decrypt`, `GetSessionToken`, `AssumeRole*`), data-reading operations (`GetObject`, `GetItem`, `Query`, `Scan`, `ReceiveMessage`), or raw log reads (`GetLogEvents`, `FilterLogEvents`) unless the user asked for that exact call.
- For write calls: scope to exactly the requested change; state the account/profile, region, and resources first; show the exact operations (the script) before running; use DryRun where the API supports it (EC2) for risky changes; confirm destructive or irreversible steps (delete, terminate, overwrite, IAM/permission changes, public exposure) explicitly even if writes are allowed in general; afterwards verify with a read and report what changed. `get_presigned_url` gives direct access to S3 object contents, so treat it like `GetObject`.
- Use the AWS CLI with `--query` where the `SKILL.md` rules apply. That path shows the command to the user in the same way.

For the user: sign in with a read-only role (`ReadOnlyAccess` or a narrower custom policy, plus the sign-in permissions below) unless you specifically want Claude to make changes. When writes are intended, ensure the role has write permissions only where intended. Keep `mcp__plugin_aws_aws-mcp__aws___run_script` out of `allow` if you want a prompt on every call (the default behavior, which is recommended for safety). Deny it in `permissions.deny` if you do not want it used at all. `ReadOnlyAccess` can still read some sensitive data such as S3 objects, DynamoDB items, and log events. Whether it includes `secretsmanager:GetSecretValue` is UNCONFIRMED. `docs/plugins/aws.md` has the details.

## Sign-in

The first use of an `aws-mcp` tool needs OAuth, which Claude Code runs through `/mcp`. The server supports dynamic client registration and S256 PKCE against AWS Sign-in.

- IAM needs `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token`. The AWS managed policy `AWSMCPSignInOAuthAccessPolicy` grants both.
- Access tokens last 1 hour and refresh for up to 12 hours.
- If the flow does not start from `/mcp`, the URL `https://aws-mcp.us-east-1.api.aws/mcp?oauth=initialize` is the documented fallback. UNCONFIRMED here.
- A session works in one account. Region defaults to `us-east-1` unless a call passes `region_name`.
- Over plain HTTP the documentation tools answer without sign-in, but in Claude Code the server shows `needs-auth` and exposes no tools until you sign in (observed 2026-10-03). `run_script` returns 401 until you sign in.
- Other regions have their own endpoint (`aws-mcp.<region>.api.aws`). The plugin declares only `us-east-1`.
