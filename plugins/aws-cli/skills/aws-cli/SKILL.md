---
name: aws-cli
description: AWS CLI v2 mechanics for scripts and write commands: pagination (--no-paginate, --max-items, --starting-token), --output and --query, the pager, retries and timeouts, waiters, skeletons with --cli-input-json, dry runs and client tokens, and the aws --version check. Use when writing or debugging an aws command or script, when output is truncated or paginated, before running a create, update, delete, or launch command, when a long call times out, or when credential source precedence (env keys vs profile) is in question. Not for read-only questions about what exists in an account or how a resource is configured (use aws-resource-query), and not for profiles, SSO login, or IAM permissions (use aws).
---

# AWS CLI v2 mechanics

Use this skill when the command itself is the problem: output shape, truncation, timeouts, retries, or a write that must be safe to run. For read-only inspection of live resources, defer to `aws-resource-query`. For credentials, profiles, SSO, and IAM, defer to `aws`.

## Procedure

1. Run `aws --version`. It must report `aws-cli/2.`. If it reports 1.x or nothing, the wrong binary is first on PATH; fix that before debugging anything else.
2. For any write (create, update, delete, launch, terminate, put, attach), show the exact command to the user and wait for confirmation before running it. The same applies to a write through the aws-mcp `run_script` or `get_presigned_url` tools; read the `aws-resource-query` skill's `references/aws-mcp.md` before calling them.
3. Pass `--region` explicitly in every script and every write command.
4. If the command supports `--dry-run` (check with `aws <service> <command> help`), run it first. A `DryRunOperation` error means the request would have succeeded; it is the pass signal, not a failure.
5. If the command supports `--client-token`, give each logical request a unique token and reuse the same token when retrying it, so a retry does not create a second resource.
6. Before a long-running call, check the default read timeout of 60 seconds. Raise it with `--cli-read-timeout <seconds>` (integer; 0 means no timeout).

## Pagination

- By default the CLI pages through results itself and returns everything.
- `--no-paginate` returns only the first page. Scripts that use it silently miss items.
- `--max-items N` caps output and prints a `NextToken`. Resume with `--starting-token <token>`; the token must be non-empty.
- `--page-size N` changes how many items each underlying API call fetches. It does not change the output.
- If you resume with `--starting-token`, set `--page-size` equal to `--max-items`, or fetch all pages and slice locally.

## Output and query

- `--output` takes `json`, `yaml`, `yaml-stream`, `text`, `table`, or `off`. `AWS_DEFAULT_OUTPUT` sets the default; `--output` overrides it.
- `--query` takes a JMESPath expression applied to the response. Use `--output text` when the result feeds a shell pipeline.
- Use `--output json` for anything another program parses.

## Pager

- `--no-cli-pager` disables the pager for one command.
- `AWS_PAGER=""` disables it for a shell or script. The `cli_pager=` setting in config does the same.
- Precedence: `--no-cli-pager` beats `cli_pager` and `AWS_PAGER`, which beat `PAGER`.

## Retries

- Set `AWS_RETRY_MODE` (`legacy`, `standard`, or `adaptive`) and `AWS_MAX_ATTEMPTS`, or the matching config keys `retry_mode` and `max_attempts`.
- `adaptive` is marked experimental in the docs. Do not use it in production scripts without saying so.
- To see what happened, pipe the debug output straight to a search: `aws <service> <command> --debug 2>&1 | grep -i retry`. Do not write debug output to a file in the working directory, since it may contain session tokens.

## Waiters

- `aws <service> wait <waiter-name>` polls until a resource reaches a state, then exits 0. Waiter names are per service; list them with `aws <service> wait help`.
- Each waiter has its own polling interval and attempt limit. `aws ec2 wait instance-running` polls every 15 seconds and exits 255 after 40 failed checks. Read the waiter's own help before assuming those numbers hold for another waiter.
- A waiter timeout exits non-zero. Check `$?` in scripts; don't treat the wait as done after an error.

## Skeletons and input files

1. Generate a template: `aws <service> <command> --generate-cli-skeleton input > req.json` (default JSON) or `yaml-input` for YAML. `output` gives the output shape.
2. Trim unneeded keys, keeping the JSON or YAML valid.
3. Run with `--cli-input-json file://req.json` or `--cli-input-yaml file://req.yaml`. The `file://` path is relative to the current directory.
4. Skeleton keys are API parameter names (`UserName`), not CLI flag names (`--user-name`). Generate the skeleton rather than guessing names.
5. Custom commands such as `aws s3` do not support skeletons or input files.

## Aliases

- Aliases are per-user shortcuts in the `alias` file under the CLI config folder (`~/.aws/cli/alias`, `[toplevel]` section). Write full commands in scripts so they run on any machine.

## Gotchas

- `--region` beats `AWS_REGION`, which beats `AWS_DEFAULT_REGION`. Put `--region` on the command when a script must hit one region.
- An explicit `--profile` ignores env keys, but `AWS_PROFILE` does not, so env keys win. Unset `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`, then confirm with `aws sts get-caller-identity --profile <p>`. To test whether a variable is set without printing it: `[ -n "${AWS_ACCESS_KEY_ID-}" ] && echo set`.
- `aws configure list` and `aws configure export-credentials` are off-limits, since they can print key material. The `aws` skill has the rule.
- Command-line options are not a way to pass credentials; the CLI has no access-key flag.
- Blob parameters are base64-encoded by default (`--cli-binary-format`). Use `fileb://` to send a file's raw bytes.
