# Plan: AWS plugin set (`aws-meta`)

Status: approved, 2026-10-18. Research: skills.sh search API and the official AWS MCP docs, both on 2026-10-18 (sources below).

## Decisions to confirm

This plan supersedes two items in `docs/plans/plugin-adoption.md`:
- Line 59 deferred an `aws-meta` "until a real project needs the whole set".
- Line ~284 rejected AWS MCP servers ("CLI skills do the same with less context").

The user asked for both on 2026-10-18. Slice 5 updates that file.

**Shape:** "an AWS plugin" becomes the project-scope `aws-meta`, because every focused plugin here ships one component. It lists:

| Plugin | Status | Component |
| --- | --- | --- |
| `aws` | new | skill: general AWS (context, identity, IAM, sign-in, cost habits) |
| `aws-cli` | new | skill: CLI mechanics and write habits |
| `aws-mcp` | new | MCP: the managed AWS MCP Server through the SigV4 proxy |
| `aws-resource-query` | existing | skill: read-only CLI inspection |
| `aws-cloudwatch` | existing | skill: incident investigation |
| `aws-well-architected` | existing | skill: review and cost |
| `cloud-ops-guard` | existing | hook: already gates subagent `aws` calls (also in `iac-meta`) |

`aws-knowledge` (new, docs-only MCP) is a direct install, not a member of `aws-meta`, for repos that touch AWS without credentials. Its 5 tools are an exact subset of `aws-mcp`'s 8 under the same `aws___*` names. Installing both registers the docs tools twice, so its README says to install one or the other.

## Skill sources (skills.sh, ranked by installs)

| Source | Installs | License | Use |
| --- | --- | --- | --- |
| `aws-iam`, [aws/agent-toolkit-for-aws](https://github.com/aws/agent-toolkit-for-aws/tree/main/skills/core-skills) | 9,733 | Apache-2.0 | port into `aws` |
| `aws-billing-and-cost-management` (same repo) | 8,543 | Apache-2.0 | cost habits only, into `aws` |
| `signing-in-to-aws` (same repo) | 5,778 | Apache-2.0 | sign-in section of `aws` |
| [`hf-cloud-aws-context-discovery`](https://github.com/huggingface/skills/tree/main/skills/hf-cloud-aws-context-discovery) | 509 | Apache-2.0 | context preamble of `aws` |
| [`mastering-aws-cli`](https://github.com/spillwavesolutions/mastering-aws-cli) | 1,949 | MIT claimed, no LICENSE file | idea list for `aws-cli` only; rewrite, don't copy |
| Skip: `aws-auth` (Cognito), zxkane/aws-skills (MCP-driven), alirezarezvani `aws-solution-architect` (generic, runs scripts), toolkit well-architected and observability skills (we have both) | | | |

Skills.sh shows install counts, not ratings, so these counts are the ranking.

## Slices

### 1. `aws` skill plugin (coder-high)

`scripts/plugins.py new aws --kind skill`. Ship the Apache-2.0 `LICENSE` and a `NOTICE` naming the upstream skills and commit SHAs, with "Modifications: merged, condensed, rewritten in house style".

The SKILL.md stays under ~120 lines. Material that doesn't fit goes to `references/iam-edge-cases.md` and `references/cost.md`.

- **Context first** (from hf):
  - Resolve the region in this order: what the user said, then `AWS_REGION`, then `AWS_DEFAULT_REGION`, then the profile. Never assume `us-east-1`.
  - Run `aws sts get-caller-identity` and report one context line.
  - Detect `AWSReservedSSO_` principals, which usually can't create IAM roles, and surface that early.
  - **Drop** its `aws configure list` advice and its line about reading `~/.aws/credentials`. Never read credential files.
- **Sign-in** (from the toolkit):
  - `aws sso login` stays for SSO users.
  - `aws login` (CLI 2.32+, `--remote` when headless) is for non-SSO users.
  - Use `SignInLocalDevelopmentAccess` when a permission error follows login.
  - CI uses OIDC or roles.
  - **Change:** the user runs the login, not the agent.
- **IAM traps** (from the toolkit `aws-iam` verified edge cases):
  - Role chaining caps a session at 1 hour.
  - Opt-in regions must be enabled in the *target* account.
  - GetSessionToken can't call IAM APIs without MFA.
  - Name the direct privilege-escalation actions.
  - `iam:PassRole` on `*` plus a compute create is an escalation path.
  - `ForAllValues` is true when the key is missing, so pair it with a `Null` check.
  - Trust policies carry `aws:SourceAccount`/`aws:SourceArn`.
  - The implementer rechecks each claim against AWS docs, because the research didn't.
- **Cost habits** (from the toolkit billing skill):
  - Check today's date first.
  - Do the arithmetic in a script.
  - Cost Explorer `End` is exclusive.
  - Use `RECORD_TYPE`, not `CHARGE_TYPE`.
  - Budgets live in us-east-1.
  - Grouped queries return no totals.
  - `compute-optimizer update-enrollment-status` mutates.
  - Deeper cost reviews go to `aws-well-architected`.
- **Routing:**
  - What exists → `aws-resource-query`.
  - Incidents → `aws-cloudwatch`.
  - Reviews → `aws-well-architected`.
  - CLI mechanics → `aws-cli`.
  - IaC → `terraform`.
- **Description:** triggers on AWS credentials, profile, SSO, region and account questions, IAM policy writing or debugging, AccessDenied, and AWS cost questions.

### 2. `aws-cli` skill plugin (coder)

`scripts/plugins.py new aws-cli --kind skill`. Written fresh; no upstream text.

- **Version check:** run `aws --version`, and watch for the v1-vs-v2 PATH conflict.
- **Credential precedence:** explicit env keys beat `--profile`/`AWS_PROFILE`. The upstream got this wrong.
- **Output:** `--output json|yaml|text|table`, JMESPath `--query`, and `--no-cli-pager` or `AWS_PAGER=""`.
- **Pagination:** `--no-paginate` vs `--max-items`/`--starting-token`.
- **Retries:** `AWS_RETRY_MODE`/`AWS_MAX_ATTEMPTS`.
- **Long operations:** waiters (`aws <svc> wait ...`) instead of polling loops.
- **Building calls:** `--generate-cli-skeleton`/`--cli-input-json` for complex calls, and `cli_alias`.
- **Write habits:** show the command and wait for the user. Prefer `--dry-run` where a service supports it (EC2). Use `--cli-read-timeout`, idempotency tokens, and `--region` explicitly.
- **Read-only inspection:** defer to `aws-resource-query`, and don't repeat its deny list.

### 3. `aws-mcp` MCP plugin (coder-high)

`scripts/plugins.py new aws-mcp --kind mcp`. It uses the managed AWS MCP Server (GA 2026-05-06, free, endpoints in us-east-1 and eu-central-1), with the same proxy approach as AWS's own `aws-core` plugin.

```json
{ "mcpServers": { "aws-mcp": {
  "command": "uvx",
  "args": ["mcp-proxy-for-aws-cli==1.7.0", "https://aws-mcp.us-east-1.api.aws/mcp", "--skip-auth", "--disable-telemetry"],
  "env": { "AWS_PROFILE": "${user_config.aws_profile}", "AWS_REGION": "${user_config.aws_region}" }
} } }
```

- **`userConfig`:**
  - `aws_profile`: string, default `default`. This avoids an empty `AWS_PROFILE`, whose boto behavior is unverified.
  - `aws_region`: string, default `us-east-1`.
- **Pin:** `mcp-proxy-for-aws-cli==1.7.0`, the same as sentry pins its npm version. `--skip-auth` keeps the docs tools working without credentials.
- **Not `--read-only` by default:** it filters on `readOnlyHint` and drops `run_script`, the server's main tool. The README documents the read-only controls instead:
  1. A read-only IAM role or profile.
  2. Never add `run_script` or `get_presigned_url` to `permissions.allow`, so each call prompts with its code.
  3. An optional IAM deny on `aws:ViaAWSMCPService` / `aws:CalledViaAWSMCP`. Verify the exact condition forms before documenting them.
  4. `--read-only` for docs-only use.
- **Reuse:** the security model and `run_script` rules from the archived `archive/plugins/aws/skills/resource-query/references/aws-mcp.md` go into the README. MCP plugins have no skill, so the README is where they live.
- **Prerequisite:** `uv` on PATH.
- **Verify** before writing the README:
  - `uvx mcp-proxy-for-aws-cli==1.7.0 --help`.
  - Whether `alwaysLoad` is a real `.mcp.json` key; drop it if not.

### 4. `aws-knowledge` MCP plugin (coder)

`{"mcpServers":{"aws-knowledge":{"type":"http","url":"https://knowledge-mcp.global.api.aws"}}}`. No auth, GA, rate-limited. It is remote, so it can't be pinned.

The README covers:
- What it adds over WebFetch: AWS's own docs search, per-region service and API availability, and `retrieve_skill`.
- Don't install it alongside `aws-mcp`.
- The privacy note.
- A "Checked" line with the `tools/list` result.

### 5. Meta and docs (coder)

- `scripts/plugins.py new aws-meta` as a meta (copy the `kubernetes-meta` shape), with project scope. Dependencies: `aws`, `aws-cli`, `aws-mcp`, `aws-resource-query`, `aws-cloudwatch`, `aws-well-architected`, `cloud-ops-guard`.
- Point the routing lines in the three existing AWS skills at `aws`, `aws-cli` and `aws-mcp` where they help, and patch-bump each.
- `recommend-plugins` named rule: CDK, SAM, AWS SDK, `samconfig.toml`, `cdk.json` or `~/.aws`-based workflows → `aws-meta`. This replaces the "AWS" area hint at line 64. Patch bump.
- `docs/plans/plugin-adoption.md`:
  - Line 59: aws-meta is now adopted (user decision, 2026-10-18).
  - Line ~259: list the new plugins in the AWS row.
  - Line ~284: drop AWS from the rejected-MCP row, and record the `aws-mcp` and `aws-knowledge` choices plus the skipped servers.
- Run `scripts/plugins.py catalog`.

### 6. Evals (with each skill slice)

Three trigger evals per new skill, each including a hard negative:
- `aws`: an IAM AccessDenied debug fires it; listing EC2 instances fires `aws-resource-query`, not `aws`.
- `aws-cli`: a paginated CLI script with waiters fires it; "what S3 buckets exist" does not.

Write the evals; don't run `claude plugin eval` by default.

### 7. Verify and ship

- `claude plugin validate --strict` on each new or touched plugin, then `scripts/plugins.py check`.
- Smoke-test `aws-meta` in a throwaway `CLAUDE_CONFIG_DIR`:
  - `/mcp` shows `aws-mcp` connected.
  - The docs tools answer with no credentials.
  - With a read-only profile, `run_script` prompts for permission.
- Reviewer pass. Use a thorough review with opus for `aws-mcp`, because of credentials and a remote code-execution tool.
- One commit per plugin, then `ship-plugin`. Push only when asked.

## Skipped servers

| Server | Why |
| --- | --- |
| AWS API MCP Server (`awslabs.aws-api-mcp-server` 1.5.6) | Its docs say it is superseded by the AWS MCP Server. `call_aws` duplicates our CLI skills, and its safety flags default to off. |
| AWS Documentation MCP (stdio, 1.2.3) | Duplicates `aws-knowledge`; only adds the `aws-cn` partition. |
| CloudWatch MCP (0.3.1) | Duplicates the `aws-cloudwatch` skill. |
| Cloud Control API MCP | Deprecated in favor of the IaC MCP Server. |
| `aws-core@claude-plugins-official` and the other official `aws-*` plugins | `aws-core` bundles skills, the MCP server and Bash hooks in one plugin, which breaks the one-component rule and overlaps ours. The rest are domain-specific (serverless, amplify, data analytics, migration and so on). |

## Acceptance criteria

- `aws-meta` installs `aws`, `aws-cli`, `aws-mcp`, the three existing AWS skills and `cloud-ops-guard`. Each focused plugin ships one component, and `check` passes.
- `aws` and `aws-cli` carry no secret-printing examples and never read credential files. Ported text keeps its Apache-2.0 attribution in `NOTICE`.
- `aws-mcp` pins the proxy version, works for the docs tools with no credentials, and documents the `run_script` permission rule.
- `plugin-adoption.md` matches the new layout.

## Resolved (user, 2026-10-18)

1. `aws-meta` is project or local scope, like the other stack metas.
2. `aws-mcp` is a dependency of `aws-meta` and is on whenever the meta is installed.
3. Only us-east-1 for now: the endpoint is fixed to `https://aws-mcp.us-east-1.api.aws/mcp`, and there is no endpoint option. The `aws_region` default is `us-east-1`.
4. `aws-cli` stays its own plugin, because the user asked for general and CLI skills separately. The size rule that folded it into `aws` is dropped.
