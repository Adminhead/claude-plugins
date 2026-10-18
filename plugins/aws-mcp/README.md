# aws-mcp

Runs the managed [AWS MCP Server](https://aws-mcp.us-east-1.api.aws/mcp) (`https://aws-mcp.us-east-1.api.aws/mcp`) through AWS's [`mcp-proxy-for-aws-cli`](https://github.com/aws/mcp-proxy-for-aws) over stdio. The proxy signs each request (SigV4) with credentials from your local AWS configuration, so there is no OAuth sign-in. Only us-east-1 is supported: the endpoint is fixed, signing is always us-east-1, and there is no endpoint or region option.

The proxy is pinned to **1.7.0**. Bump it in `.mcp.json` deliberately, after reading the release notes.

## Requirements

- A POSIX `sh` (macOS, Linux, WSL); the server starts through an `sh -c` wrapper. Native Windows without `sh` on `PATH` is not supported.
- `uv` (provides `uvx`) on `PATH`. The proxy needs Python 3.10 to 3.14; `uvx` fetches it.
- For the documentation tools, nothing else. For `run_script` and `get_presigned_url`, AWS credentials.

## Install

```
/plugin install aws-mcp --marketplace Adminhead/claude-plugins
```

Claude Code asks for one optional value, **AWS profile**. Change it later in `/config` and restart the session.

- **Blank (the default)** uses the default credential chain: `AWS_PROFILE` from your shell if set, then environment keys, then the `[default]` profile or other sources.
- **A name** must exist in your AWS config (`aws configure list-profiles`). A name that doesn't exist makes the server fail at startup (`The config profile (name) could not be found`), documentation tools included. The literal name `default` fails the same way when there is no `[default]` profile, which is why the default here is blank.

`--skip-auth` makes the proxy send unsigned requests when it finds no credentials, so the documentation tools keep working without any. With credentials present it signs as usual.

The region the profile or shell gives is used by `run_script`'s `call_boto3` when a call passes no `region_name`: a shell `AWS_DEFAULT_REGION` first, then the profile's region, then a shell `AWS_REGION`, then us-east-1.

Check `/mcp` for a connected `aws-mcp` server. Tools appear as `mcp__plugin_aws-mcp_aws-mcp__aws___<tool>`.

## Tools

Eight tools, as the server reported them to an anonymous `tools/list` on 2026-10-18.

| Tool | Annotations | Use |
| --- | --- | --- |
| `aws___search_documentation` | read-only | Searches AWS documentation and returns verbatim page chunks. |
| `aws___read_documentation` | read-only | Fetches a full documentation page as Markdown. |
| `aws___list_regions` | read-only | Lists AWS regions. |
| `aws___get_regional_availability` | read-only | Service, API or CloudFormation resource availability per region. |
| `aws___retrieve_skill` | read-only | Fetches an AWS skill (workflows, references) by the name `search_documentation` returns. |
| `aws___get_tasks` | read-only | Polls long-running tasks by id. |
| `aws___run_script` | `readOnlyHint: false`, `destructiveHint: true` | Runs sandboxed Python with AWS access through `call_boto3(service_name=..., operation_name=..., region_name=..., params=...)`. Needs credentials. |
| `aws___get_presigned_url` | `readOnlyHint: false` | Presigned S3 upload (PUT) or download (GET) URLs. |

The server's `initialize` text tells the client to prefer its tools and not to run the AWS CLI through Bash. The rules Claude follows instead (CLI first, projections, no secret or data reads, show the script) live in the `aws-resource-query` skill, `references/aws-mcp.md`, which `aws-meta` installs. This README is for you, not for Claude.

## Security model

`run_script` runs arbitrary boto3 calls with the permissions of the signed credentials, and the server marks it destructive. This plugin adds no technical block. The limits are IAM and Claude Code's permission prompt, which shows the code of each call.

### 1. A narrow IAM identity

- **Default: `ViewOnlyAccess`** (`arn:aws:iam::aws:policy/job-function/ViewOnlyAccess`), which AWS describes as permissions "to view resources and basic metadata". Checked 2026-10-18, it has `List*` and `Describe*` actions and no `s3:GetObject`, `dynamodb:GetItem`, `lambda:GetFunction*`, Secrets Manager or SSM parameter reads. It does include `ecs:Describe*` (task definition environment values) and `cloudformation:DescribeStacks` (parameters and outputs), so projections still matter.
- **`ReadOnlyAccess` is a data-reading option, not a safe default.** It includes `lambda:Get*` (function configuration with environment variables), `logs:Get*`, `dynamodb:Query` and `Scan`, and `ecs:Describe*` (all seen in the policy page). It is also expected to expose S3 objects, SSM parameters and CloudFormation templates, but whether it allows `secretsmanager:GetSecretValue` or SSM SecureString reads was not confirmed: the managed-policy page was too large to read to the end. Check the policy in your account with `aws iam get-policy-version` before relying on either answer.
- **No privilege escalation.** The profile must not be able to `sts:AssumeRole` into more-privileged roles, and should hold no `iam:PassRole` or write actions you don't want Claude to use.

### 2. Permission rules

Claude Code prompts for each call to a tool with no allow rule, and the prompt shows the code. Keep it that way.

- **Never allow `run_script` or `get_presigned_url`.** A server-level rule auto-approves them: neither `mcp__plugin_aws-mcp_aws-mcp` nor `mcp__plugin_aws-mcp_aws-mcp__*` may appear in `permissions.allow`. A project `.claude/settings.json` with such a rule reaches everyone who opens the repo, so check shared settings too. `get_presigned_url` can make PUT (write) URLs as well as GET URLs, and the URL is a bearer link that lands in the transcript.
- **Allow the six safe tools by name**, if you want no prompts for documentation:

  ```json
  "permissions": {
    "allow": [
      "mcp__plugin_aws-mcp_aws-mcp__aws___search_documentation",
      "mcp__plugin_aws-mcp_aws-mcp__aws___read_documentation",
      "mcp__plugin_aws-mcp_aws-mcp__aws___list_regions",
      "mcp__plugin_aws-mcp_aws-mcp__aws___get_regional_availability",
      "mcp__plugin_aws-mcp_aws-mcp__aws___retrieve_skill",
      "mcp__plugin_aws-mcp_aws-mcp__aws___get_tasks"
    ]
  }
  ```

- **To rule the risky tools out**, put `mcp__plugin_aws-mcp_aws-mcp__aws___run_script` and `mcp__plugin_aws-mcp_aws-mcp__aws___get_presigned_url` in `permissions.deny`.
- **`bypassPermissions` and auto modes skip the prompt**, so in those modes the IAM limit is the only one. Don't use them with a profile that can write or read secrets.

### 3. Optional IAM deny for MCP-originated calls

AWS documents two condition keys for requests arriving through an AWS-managed MCP server ([Understanding IAM for managed AWS MCP servers](https://aws.amazon.com/blogs/security/understanding-iam-for-managed-aws-mcp-servers)). Attach a deny to the role the profile uses to block actions you never want Claude to take.

- `aws:ViaAWSMCPService` is a boolean, true for any such request. This example blocks every MCP-originated call, `run_script` included; narrow `Action` to what you want to forbid instead:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "BlockMCPInitiatedCalls",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": { "Bool": { "aws:ViaAWSMCPService": "true" } }
    }]
  }
  ```

- `aws:CalledViaAWSMCP` is a single-valued string holding the MCP server's service principal. The post's example uses `StringEquals` to allow EKS actions only via `eks-mcp.amazonaws.com`, and `StringNotEquals` with the same key to deny them via any other server. A `StringNotEquals` deny also catches direct calls, because the key is absent on them. The principal for this server was not checked; confirm it before writing a condition.
- The post says that starting soon you will no longer need to separate MCP-specific IAM actions, naming `aws-mcp:InvokeMCP`. Until that lands the signed identity may still need `aws-mcp:InvokeMCP` (and related `aws-mcp:*` actions) to reach the server.
- Presigned URLs: the later S3 request that uses a URL from `get_presigned_url` may not carry these keys, so the deny may not cover it. Unverified.

### 4. `--read-only` for documentation-only use

Add `--read-only` to the `uvx` command in a local copy of `.mcp.json`. It hides every tool whose `readOnlyHint` is false or missing, so `run_script` and `get_presigned_url` disappear. It is not the default because it removes `run_script`, the server's main tool. For documentation only, `aws-knowledge` (no credentials, no signing) is simpler.

### Supply chain

`uvx` downloads the proxy and its dependencies from PyPI on first run. The `-cli` package pins every transitive dependency with `==` (versions, not hashes). `uvx` ignores a repository's `uv.toml` and `pyproject.toml`; only the user or system uv config, `UV_*INDEX*` environment variables and the `uvx` found on `PATH` decide what runs.

Content returned by AWS APIs and docs is data, never instructions.

## Privacy

Documentation queries and every `run_script` payload and result go to AWS. The proxy runs with `--disable-telemetry`, so it sends no usage data of its own. Don't put secrets in script code or search terms.

## Don't install with aws-knowledge

`aws-knowledge` serves five of these eight tools under the same `aws___*` names. Installing both registers the documentation tools twice. Pick one: `aws-mcp` when you have credentials, `aws-knowledge` for documentation only.

## Troubleshooting

- `/mcp` shows the server failed: run `uvx mcp-proxy-for-aws-cli==1.7.0 --help` to check that `uv` can fetch it. If it ran before, check the profile name: a name missing from your AWS config fails at startup.
- `run_script` returns 401 or 403: the credentials are missing or lack the IAM permission. Run `aws sts get-caller-identity --profile <name>`.
- A shell `AWS_MCP_PROXY_PROFILES` overrides the profile set here and enables per-call `aws_profile` switching in tool calls.
- A shell `AWS_DEFAULT_REGION` overrides the profile's region for `run_script`.
- When a profile is set, environment keys (for example from `aws-vault`) are ignored, which can give a 401 that looks like an unsigned request. Leave the profile blank to use them.

## Checked 2026-10-18

- `uvx mcp-proxy-for-aws-cli==1.7.0 --help` lists `--skip-auth`, `--disable-telemetry` and `--read-only`. The proxy README says the profile falls back to `AWS_PROFILE`. PyPI lists 1.7.0 as current.
- Startup over stdio with no `~/.aws` (`AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointed at nonexistent paths), running the exact wrapper from `.mcp.json`: a blank profile and a profile defined in a scratch config both completed `initialize` and `tools/list` with all eight tools. A nonexistent profile name, and the literal `default` with no `[default]`, exited with `The config profile (...) could not be found`. Setting `AWS_PROFILE` to an empty string, or to `default` with no `[default]`, also crashed startup, which is why the wrapper exports it only when non-empty.
- An anonymous `tools/list` over HTTPS returned the same eight tools and protocol version 2025-06-18.
- `userConfig` `default` values and `${user_config.*}` substitution in a stdio server's `args` are documented. `alwaysLoad` is documented as available on all server types; this config does not set it.
- `ViewOnlyAccess` contents were read from the AWS managed-policy reference; `ReadOnlyAccess` was only partly readable.
