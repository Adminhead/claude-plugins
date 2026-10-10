# Failure classes

Use this to classify a failed run (SKILL.md, "Failed run"). Match the first failing log line to a class, confirm with the check, then fix the cause. These are common causes, not a closed list.

## Missing variable or secret

- **Signs.** An empty value where one is expected, `Input required and not supplied`, `Error: ... is not set`, or a tool failing on a blank argument. Secrets print as `***` or empty. A secret is also empty for a fork's `pull_request` run and for Dependabot-triggered runs, which read the Dependabot secret store, not the Actions one.
- **Check.** Confirm the name and scope exist: `gh variable list`, `gh secret list` (names only, add `--env <name>` for environment scope, `--app dependabot` for Dependabot). Compare spelling and case with the workflow's `${{ vars.X }}` or `${{ secrets.X }}`.
- **Fix.** If the name is wrong, fix the workflow. If it is missing, ask the user to set it. Don't create or print secrets yourself.

## OIDC or permissions

- **Signs.** `Could not assume role`, `Not authorized to perform sts:AssumeRoleWithWebIdentity`, `No OIDC token`, or `Resource not accessible by integration` (403 from the `GITHUB_TOKEN`).
- **Check.** The job needs `permissions: id-token: write` for OIDC, plus whatever the failing API call needs (`contents`, `pull-requests`, `packages`). The cloud role's trust policy must match the token's `sub` and `aud`. The `sub` changes with the trigger: branch, tag, pull request, and `environment:` each produce a different value, and a reusable workflow changes the claims you can match.
- **Fix.** Add only the job-level permission the failing call needs. A trust-policy or role change is cloud-side and the user's decision. Report the exact `sub` and condition that failed to match. Never widen to `write-all` or swap in a long-lived key.

## Runner or toolcache

- **Signs.** `Version X.Y not found in the tool cache`, a `setup-*` action failing to unpack or write under `RUNNER_TOOL_CACHE`, a missing preinstalled tool (`docker`, `jq`, `gh`, a language toolchain), or a job queued forever with no runner.
- **Check.** Look at `runs-on`. A self-hosted or managed runner (such as AWS CodeBuild-hosted runners) does not carry the GitHub-hosted image's preinstalled tools or a writable, pre-warmed toolcache. Check the runner label, the image or architecture, and whether the tool cache directory exists and is writable.
- **Fix.** Install the tool in an explicit step, point the setup action at a writable cache directory, or pin a version the runner can download. If the label has no runner, that is a runner or project configuration problem to report, not a workflow bug. Don't move a job that uses secrets onto a different runner without the security reference.

## Flaky

- **Signs.** Network timeouts, registry or download 5xx, a rate limit, or a test that failed here but passed on the previous run of the same commit.
- **Check.** Compare with the last run at the same `headSha` (`gh run list --commit <sha>`). A failure unrelated to the diff, with a transient message, is flaky.
- **Fix.** Rerun failed jobs once (`gh run rerun <run-id> --failed`). If it fails the same way again, it is not flaky. Reclassify. Recurring flakes get a retry on the step that touches the network, or a bug for the test, not blind reruns.

## Code

- **Signs.** A compile error, failing test assertion, lint or type error, or a failing script that reproduces locally.
- **Check.** Reproduce the failing command locally if the repo allows it, and read the diff for the run's `headSha`.
- **Fix.** Change the code or the test, then push. Leave the workflow alone.
